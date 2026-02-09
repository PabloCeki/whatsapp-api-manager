const COMPOSING_DELAY_MS = 4000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendMessageUsecase = (dependencies) => async ({ params }) => {
    const { logger } = dependencies;
    const { sock, target, message } = params;
    const cleanTarget = target.replace('+', '');
    const targetJid = `${cleanTarget}@s.whatsapp.net`;
    await sock.presenceSubscribe(targetJid);
    await sock.sendPresenceUpdate('composing', targetJid);
    await delay(COMPOSING_DELAY_MS);
    await sock.sendPresenceUpdate('paused', targetJid);
    const sent = await sock.sendMessage(targetJid, { text: message });
    logger.info(`[+] Mensaje enviado a ${target}. ID: ${sent.key.id}`);
    return sent;
}

export default sendMessageUsecase;
