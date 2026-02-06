import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TARGET_NUMBER = "5493865596760"; // <-- Reemplazar con el numero destino (con codigo de pais, sin +)
const TARGET_JID = `${TARGET_NUMBER}@s.whatsapp.net`;
const MESSAGE_TEXT = "Hola, este es un mensaje de prueba automatizado.fdfdfd";
const COMPOSING_DELAY_MS = 4_000;
const AUTH_FOLDER = "./auth_info";

const logger = pino({ level: "debug" });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  console.log(state.creds)
  const sock = makeWASocket.default({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: true, // Muestra el QR directamente en la terminal
    syncFullHistory: false, // Ligero: sin sincronizacion de historial
    generateHighQualityLinkPreview: false,
  });

  // Persistir credenciales cada vez que se actualizan
  sock.ev.on("creds.update", saveCreds);

  // Manejar eventos de conexion
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[*] Escanea el codigo QR de arriba con WhatsApp.\n");
    }

    if (connection === "close") {
      const statusCode = /** @type {Boom} */ (lastDisconnect?.error)?.output
        ?.statusCode;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[!] Conexion cerrada. Codigo: ${statusCode}. ` +
          (shouldReconnect
            ? "Reconectando..."
            : "Sesion cerrada (loggedOut). No se reconecta."),
      );

      if (shouldReconnect) {
        start(); // Reconexion automatica
      } else {
        process.exit(0);
      }
    }

    if (connection === "open") {
      console.log("[+] Conexion establecida correctamente.");
      await sendTestMessage(sock);
    }
  });
}

// ---------------------------------------------------------------------------
// Envio de mensaje con heuristica de presencia
// ---------------------------------------------------------------------------
async function sendTestMessage(sock) {
  try {
    // 1. Simular que estamos "componiendo" un mensaje
    console.log(
      `[~] Simulando presencia 'composing' durante ${COMPOSING_DELAY_MS / 1000}s...`,
    );
    await sock.presenceSubscribe(TARGET_JID);
    await sock.sendPresenceUpdate("composing", TARGET_JID);

    // 2. Esperar el tiempo configurado
    await delay(COMPOSING_DELAY_MS);

    // 3. Quitar presencia de "componiendo"
    await sock.sendPresenceUpdate("paused", TARGET_JID);

    // 4. Enviar el mensaje
    const sent = await sock.sendMessage(TARGET_JID, { text: MESSAGE_TEXT });
    console.log(`[+] Mensaje enviado a ${TARGET_NUMBER}. ID: ${sent.key.id}`);
  } catch (err) {
    console.error("[!] Error al enviar el mensaje:", err.message);
  } finally {
    console.log("[*] Trabajo completado. Cerrando...");
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
start().catch((err) => {
  console.error("[!] Error fatal:", err);
  process.exit(1);
});
