import fs from "fs/promises";
import path from "path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { fromIni } from "@aws-sdk/credential-providers";
// Configuración - Ajustá el clientId según tu usuario de Firebase
const CONFIG = {
  region: "us-east-1", // Tu región de AWS
  tableName: "whatsapp_sessions",
  clientId: "firebase_user_local_test",
  authDir: "./auth_info", // Carpeta donde están tus JSON
};

// Inicialización del cliente con soporte para perfiles
const client = new DynamoDBClient({
  region: CONFIG.region,
  credentials: fromIni({ profile: "xuniv" }),
  // El SDK v3 detecta automáticamente el perfil si está en las variables de entorno
  // o podés usar la librería @aws-sdk/credential-providers si querés forzarlo
});

const docClient = DynamoDBDocumentClient.from(client);

// Tipos conocidos de SignalDataTypeMap en Baileys (ordenados de más largo a más corto
// para que el match sea correcto, ej: "app-state-sync-version" antes que "app-state-sync-key").
const KNOWN_TYPES = [
  "app-state-sync-version",
  "app-state-sync-key",
  "sender-key-memory",
  "sender-key",
  "pre-key",
  "session",
];

/**
 * Convierte el nombre de archivo (sin .json) al dataType que Baileys usa internamente.
 * Baileys escribe archivos con fixFileName que reemplaza ":" por "-",
 * así que "pre-key:1" se guarda como "pre-key-1.json".
 * Esta función revierte esa transformación.
 */
function fileNameToDataType(baseName) {
  if (baseName === "creds") return "creds";

  for (const type of KNOWN_TYPES) {
    const prefix = type + "-";
    if (baseName.startsWith(prefix)) {
      const id = baseName.slice(prefix.length);
      return `${type}:${id}`;
    }
  }

  // Si no matchea ningún tipo conocido, devolver tal cual
  return baseName;
}

async function migrate() {
  try {
    const files = await fs.readdir(CONFIG.authDir);
    console.log(`🚀 Iniciando migración de ${files.length} archivos...`);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(CONFIG.authDir, file);
      const content = await fs.readFile(filePath, "utf-8");

      // Definimos la Sort Key (dataType) basada en el nombre del archivo.
      // Baileys usa fixFileName que convierte ":" -> "-" al escribir archivos,
      // así que revertimos esa transformación según el tipo conocido.
      const baseName = file.replace(".json", "");
      const dataType = fileNameToDataType(baseName);

      const params = {
        TableName: CONFIG.tableName,
        Item: {
          clientId: CONFIG.clientId,
          dataType: dataType,
          // Creds: guardar como string JSON (consistente con saveCreds de la Lambda).
          // Keys: guardar como objeto parseado (consistente con keys.set de la Lambda).
          // Esto evita el bug de double-stringify al leer desde getDynamoDBAuth.
          payload: dataType === 'creds' ? content : JSON.parse(content),
          updatedAt: Date.now(),
          // TTL de 3 meses para registros que no sean 'creds'
          ...(dataType !== "creds" && {
            ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
          }),
        },
      };

      await docClient.send(new PutCommand(params));
      console.log(`✅ Migrado: ${file} -> SK: ${dataType}`);
    }

    console.log("\n✨ Migración completada con éxito.");
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
  }
}

migrate();
