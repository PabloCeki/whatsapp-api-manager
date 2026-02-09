import {
  getDynamoDBAuthUsecase,
  initializeWSBaileysUsecase,
  sendMessageUsecase,
} from './src/usecases/index.mjs';

const CLIENT_ID = 'firebase_user_local_test';
const TARGET = '5493865596760';

(async () => {
  try {
    const { state, saveCreds, hasValidSession } = await getDynamoDBAuthUsecase({
      params: { clientId: CLIENT_ID },
    });

    console.log(`[*] Sesión válida en DynamoDB: ${hasValidSession}`);

    if (!hasValidSession) {
      console.log(
        '[*] No hay sesión guardada. Se mostrará el QR para escanear...',
      );
    }

    const result = await initializeWSBaileysUsecase({
      params: {
        onClose: (lastDisconnect) => {
          console.log(
            '[*] Conexión cerrada:',
            lastDisconnect?.error?.message || 'desconocido',
          );
        },
        onOpen: async (sock) => {
          console.log('[+] Conexión abierta! Enviando mensaje...');
          await sendMessageUsecase({
            params: {
              sock,
              target: TARGET,
              message: 'Hello World',
            },
          });
        },
        state,
        saveCreds,
        clientId: CLIENT_ID,
      },
    });

    console.log('[+] Resultado:', result);
  } catch (err) {
    console.error('[!] Error:', err.message || err);
    process.exit(1);
  }
})();
