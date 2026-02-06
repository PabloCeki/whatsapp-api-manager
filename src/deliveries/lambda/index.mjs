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
const COMPOSING_DELAY_MS = 4000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [FIX Bug 1] Eliminado process.exit(0) — mata el runtime de Lambda,
// impidiendo que las escrituras a DynamoDB se completen y que el handler
// retorne una respuesta HTTP.
async function sendMessage(sock, targetJid, message) {
  await sock.presenceSubscribe(targetJid);
  await sock.sendPresenceUpdate('composing', targetJid);
  await delay(COMPOSING_DELAY_MS);
  await sock.sendPresenceUpdate('paused', targetJid);
  const sent = await sock.sendMessage(targetJid, { text: message });
  console.log(`[+] Mensaje enviado a ${targetJid}. ID: ${sent.key.id}`);
  return sent;
}

export const handler = async (event) => {
  const body =
    typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { clientId, message, target } = body;

  const cleanTarget = target.replace('+', '');
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  console.log(`[!] Enviando mensaje para ${clientId} a ${targetJid}`);

  try {
    const { state, saveCreds, hasValidSession } = await getDynamoDBAuth(clientId);

    if (!hasValidSession) {
      console.error(`[!] No existe sesión válida para ${clientId}`);
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No valid session found. Please scan QR first.' }),
      };
    }

    const { version } = await fetchLatestBaileysVersion();

    // [FIX Bug 2] Usamos settle() para garantizar que la Promise siempre
    // se resuelve exactamente una vez (éxito, close, o timeout).
    return await new Promise((resolve) => {
      let settled = false;
      const settle = (response) => {
        if (!settled) {
          settled = true;
          resolve(response);
        }
      };

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

      // [FIX Bug 4] Actualizar creds en memoria antes de persistir,
      // para que escrituras consecutivas no se pisen entre sí.
      sock.ev.on('creds.update', async (update) => {
        Object.assign(state.creds, update);
        await saveCreds(clientId, state.creds);
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          try {
            // [FIX Bug 2] Resolver la Promise con un 200 después de enviar.
            const sent = await sendMessage(sock, targetJid, message);
            // [FIX Bug 5] Cerrar el socket limpiamente.
            sock.end();
            settle({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ success: true, messageId: sent.key.id }),
            });
          } catch (err) {
            console.error('[!] Error al enviar mensaje:', err.message);
            sock.end();
            settle({
              statusCode: 500,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: err.message }),
            });
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            settle({
              statusCode: 401,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'Session expired. Please scan QR again.' }),
            });
          } else {
            // Cualquier otro cierre (connection lost, replaced, etc.)
            settle({
              statusCode: 503,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: `Connection closed (code: ${statusCode})` }),
            });
          }
        }
      });

      // Timeout de seguridad — resolve en vez de reject para evitar
      // unhandled rejections si el socket ya cerró.
      setTimeout(() => {
        sock.end();
        settle({
          statusCode: 504,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'WhatsApp connection timeout' }),
        });
      }, 25000);
    });
  } catch (err) {
    console.error('[!] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
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

  // [FIX Bug 3] Manejar payload tanto string (migración) como object (Lambda writes)
  const parsedPayload = credsItem
    ? JSON.parse(
        typeof credsItem.payload === 'string'
          ? credsItem.payload
          : JSON.stringify(credsItem.payload),
        BufferJSON.reviver,
      )
    : null;
  const hasValidSession = !!(parsedPayload?.me || parsedPayload?.account);

  const creds = parsedPayload || initAuthCreds();

  const keysCache = {};
  items
    .filter((i) => i.dataType !== 'creds')
    .forEach((item) => {
      // Usar indexOf para soportar IDs con múltiples ':'
      // (ej: "session:5493865596760:1")
      const colonIdx = item.dataType.indexOf(':');
      const category = item.dataType.slice(0, colonIdx);
      const id = item.dataType.slice(colonIdx + 1);
      if (!keysCache[category]) keysCache[category] = {};

      // [FIX Bug 3] Si payload es string (datos migrados), parsearlo directo.
      // Si es object (escrito por Lambda), serializarlo primero para que el
      // reviver pueda reconstruir los Buffers.
      const raw =
        typeof item.payload === 'string'
          ? item.payload
          : JSON.stringify(item.payload);
      keysCache[category][id] = JSON.parse(raw, BufferJSON.reviver);
    });

  const keys = {
    get: async (type, ids) => {
      const data = {};
      for (const id of ids) {
        const value = keysCache[type]?.[id];
        if (value) {
          data[id] = value;
        }
      }
      return data;
    },
    set: async (data) => {
      const putPromises = [];
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          if (!keysCache[category]) keysCache[category] = {};
          keysCache[category][id] = value;

          putPromises.push(
            docClient.send(
              new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                  clientId,
                  dataType: `${category}:${id}`,
                  payload: JSON.parse(JSON.stringify(value, BufferJSON.replacer)),
                  updatedAt: Date.now(),
                },
              }),
            ),
          );
        }
      }
      await Promise.all(putPromises);
    },
  };

  return {
    state: { creds, keys },
    hasValidSession,
    // [FIX Bug 4] Recibe las creds completas (ya actualizadas en memoria)
    // en vez de un update parcial, evitando que escrituras consecutivas
    // se pisen.
    saveCreds: async (clientId, fullCreds) => {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            clientId,
            dataType: 'creds',
            payload: JSON.stringify(fullCreds, BufferJSON.replacer),
            updatedAt: Date.now(),
          },
        }),
      );
    },
  };
}
