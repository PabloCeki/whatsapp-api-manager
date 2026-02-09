const sendMessageController = (dependencies) => async ({ sqsBodyParams, authorizer }) => {

    const { sendMessageUsecase, initializeWSBaileysUsecase, getDynamoDBAuthUsecase } = dependencies;
    const { body = {}, queryParams = {} } = sqsBodyParams;
    const { target, message } = body;
    const { uid } = authorizer;
    let result;
    const { state, saveCreds, hasValidSession } = await getDynamoDBAuthUsecase({params: {clientId: uid}});
    if (!hasValidSession) {
        return {
            status: 200,
            response: {
                success: true,
                message: 'Session not started'
            }
        }
    }
    await initializeWSBaileysUsecase({
        params: {
            onClose: (lastDisconnect) => {
                console.log('[*] Conexión cerrada:', lastDisconnect?.error?.message || 'desconocido');
            },
            onOpen: async (sock) => {
                console.log('[+] Conexión abierta! Enviando mensaje...');
                await sendMessageUsecase({
                    params: {
                        sock,
                        target,
                        message
                    }
                })
                sock.end();
            },
            state,
            saveCreds,
            clientId: uid
        }
    }).catch((err) => {
        console.error('[!] Error:', err.message || err);
        result = err.message;
       
    });
    
    return {
        status: 200,
        response: {
            success: true,
            message: result || 'Message sent'
        }
    };
}

export default sendMessageController;