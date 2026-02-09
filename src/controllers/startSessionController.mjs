const startSessionController = (dependencies) => async ({ authorizer }) => {
  const {
    initializeWSBaileysUsecase,
    getDynamoDBAuthUsecase,
    postWSApiMessageUsecase,
    getWsConnectionIdUsecase,
  } = dependencies;
  const { uid } = authorizer;

  const connectionId = await getWsConnectionIdUsecase({
    params: { userId: uid },
  });
  if (!connectionId) throw new Error('No connection found for user');

  const { state, saveCreds, hasValidSession } = await getDynamoDBAuthUsecase({
    params: { clientId: uid },
  });
  if (hasValidSession)
    return {
      response: {
        success: true,
        message: 'Session already started',
        connectionId,
      },
      status: 200,
    };
  await initializeWSBaileysUsecase({
    params: {
      onClose: (lastDisconnect) => {
        console.log(
          '[*] Conexión cerrada:',
          lastDisconnect?.error?.message || 'desconocido',
        );
      },
      onOpen: async (sock, qr) => {
        await postWSApiMessageUsecase({
          params: {
            connectionId,
            message: qr,
          },
        });
        sock.end();
      },
      state,
      saveCreds,
      clientId: uid,
    },
  });
  return {
    status: 200,
    response: {
      success: true,
      connectionId,
    },
  };
};

export default startSessionController;
