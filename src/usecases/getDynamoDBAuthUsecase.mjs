const getDynamoDBAuthUsecase = (dependencies) => async ({ params }) => {
  const { model, initAuthCreds, BufferJSON } = dependencies;
  const { clientId } = params;

  const result = await model.queryTable({
    KeyConditionExpression: 'clientId = :id',
    ExpressionAttributeValues: { ':id': clientId },
  });
  const items = result.items || [];
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
            model.putItem({
              clientId,
              dataType: `${category}:${id}`,
              payload: JSON.parse(JSON.stringify(value, BufferJSON.replacer)),
              updatedAt: Date.now(),
            }),
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
      await model.putItem({
        clientId,
        dataType: 'creds',
        payload: JSON.stringify(fullCreds, BufferJSON.replacer),
        updatedAt: Date.now(),
      });
    },
  };
};

export default getDynamoDBAuthUsecase;
