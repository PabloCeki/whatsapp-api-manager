import { BAILEYS_ERRORS } from '../exceptions/index.mjs';
const { EXPIRED_SESSION, SESSION_CLOSED, CONNECTION_TIMEOUT } = BAILEYS_ERRORS;
const initializeWSBaileysUsecase = (dependencies) => async ({ params }) => {
  const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    initAuthCreds,
    BufferJSON,
    makeWASocket,
    logger,
  } = dependencies;
  const { version } = await fetchLatestBaileysVersion();
  const { onClose, onOpen, state, saveCreds, clientId } = params;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const settle = (response) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(response);
      }
    };
    const fail = (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    };

    const connectSocket = () => {
      if (!state.creds || Object.keys(state.creds).length === 0) {
        state.creds = initAuthCreds();
      }
      const sock = makeWASocket.default({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      sock.ev.on('creds.update', async (update) => {
        try {
          Object.assign(state.creds, update);
          await saveCreds(clientId, state.creds);
        } catch (err) {
          console.error('[!] Error guardando creds:', err.message);
        }
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('--- QR recibido, escaneá con tu teléfono ---');
          await onOpen(sock, qr);
        }

        if (connection === 'open') {
          try {
            if (typeof onOpen === 'function') await onOpen(sock);

            settle({ success: true });
            sock.end();
          } catch (err) {
            console.error('[!] Error en onOpen:', err.message);
            sock.end();
            fail(EXPIRED_SESSION);
          }
        }

        if (connection === 'close') {
          if (settled) return;

          const statusCode = lastDisconnect?.error?.output?.statusCode;

          if (statusCode === DisconnectReason.loggedOut) {
            fail(EXPIRED_SESSION);
            return;
          }

          // Stream Errored, restart required, etc. → reconectar
          console.log('[*] Conexión cerrada, reconectando...');
          connectSocket();
        }
      });
    };

    connectSocket();

    timeoutId = setTimeout(() => {
      fail(CONNECTION_TIMEOUT);
    }, 60000);
  });
};

export default initializeWSBaileysUsecase;
