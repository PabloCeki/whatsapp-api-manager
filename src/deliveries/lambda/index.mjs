import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  BufferJSON,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'error' });
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = 'whatsapp_sessions';

export const handler = async (event) => {
  // Parseo del body desde API Gateway Proxy
  const body =
    typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { clientId, message, target } = body;

  // Normalización del número (quitamos el + si viene)
  const cleanTarget = target.replace('+', '');
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  console.log(`[!] Enviando mensaje para ${clientId} a ${targetJid}`);

  try {
    // 1. Obtener estado desde DynamoDB
    const { state, saveState } = await getDynamoDBAuth(clientId);
    const { version } = await fetchLatestBaileysVersion();

    return await new Promise((resolve, reject) => {
      const sock = makeWASocket.default({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      // Persistencia de credenciales (Importante para evitar deslogueo)
      sock.ev.on('creds.update', async (update) => {
        await saveState(clientId, update);
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          // Heurística rápida
          await sock.sendPresenceUpdate('composing', targetJid);
          await new Promise((r) => setTimeout(r, 2000));

          const sent = await sock.sendMessage(targetJid, { text: message });

          console.log(`[+] Mensaje enviado: ${sent.key.id}`);
          sock.end(); // Cerramos socket

          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'sent', id: sent.key.id }),
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            resolve({
              statusCode: 401,
              body: JSON.stringify({ error: 'Session expired' }),
            });
          }
        }
      });

      // Timeout de seguridad interno
      setTimeout(() => {
        sock.end();
        reject(new Error('Timeout de conexión con WhatsApp'));
      }, 25000);
    });
  } catch (err) {
    console.error('[!] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function getDynamoDBAuth(clientId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'clientId = :id',
      ExpressionAttributeValues: { ':id': clientId },
    }),
  );

  const items = result.Items || [];
  const credsItem = items.find((i) => i.dataType === 'creds');

  const creds = credsItem
    ? JSON.parse(JSON.stringify(credsItem.payload), BufferJSON.reviver)
    : initAuthCreds();

  const keys = {};
  items
    .filter((i) => i.dataType !== 'creds')
    .forEach((item) => {
      const [category, id] = item.dataType.split(':');
      if (!keys[category]) keys[category] = {};
      keys[category][id] = JSON.parse(
        JSON.stringify(item.payload),
        BufferJSON.reviver,
      );
    });

  return {
    state: { creds, keys },
    saveState: async (clientId, update) => {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            clientId,
            dataType: 'creds',
            payload: JSON.parse(JSON.stringify(update, BufferJSON.replacer)),
            updatedAt: Date.now(),
          },
        }),
      );
    },
  };
}
