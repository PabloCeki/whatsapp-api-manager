import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
  QueryCommand,
  UpdateItemCommand,
  BatchWriteItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Clase para interactuar con DynamoDB usando AWS SDK v3
 * Proporciona métodos para operaciones CRUD básicas y algunas operaciones avanzadas
 */
export class DynamoDBManager {
  /**
   * Constructor de la clase DynamoDBManager
   * @param {Object} config - Configuración para el cliente DynamoDB
   * @param {string} config.region - Región de AWS
   * @param {string} config.tableName - Nombre de la tabla por defecto
   * @param {Object} config.credentials - Credenciales de AWS (opcional)
   */
  constructor(config = {}) {
    const {
      region = 'us-east-1',
      tableName,
      credentials,
      dynamoEndpoint,
      keys = ({ pK = 'PK', sK = 'SK' } = {}),
    } = config;

    this.client = new DynamoDBClient({
      region,
      ...(credentials && { credentials }),
      endpoint: dynamoEndpoint,
    });

    this.tableName = tableName;
    this.keys = keys;
  }

  /**
   * Establece la tabla por defecto para las operaciones
   * @param {string} tableName - Nombre de la tabla
   */
  setTableName(tableName) {
    this.tableName = tableName;
  }

  /**
   * Crea o actualiza un ítem en la tabla
   * @param {Object} item - Objeto con los datos a guardar
   * @param {string} [tableName] - Nombre de la tabla (opcional, usa la tabla por defecto si no se especifica)
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   */
  async putItem(item, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    const params = {
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    };

    try {
      const command = new PutItemCommand(params);
      const response = await this.client.send(command);
      return response;
    } catch (error) {
      console.error('Error al guardar el ítem en DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Obtiene un ítem de la tabla por su clave primaria
   * @param {Object|string} keyOrPK - Objeto con la clave primaria completa o valor de la clave de partición (PK)
   * @param {string} [sk] - Valor de la clave de ordenación (SK), requerido si keyOrPK es un string
   * @param {Object} [options] - Opciones adicionales para la consulta
   * @param {string} [options.pkName='PK'] - Nombre del atributo de la clave de partición
   * @param {string} [options.skName='SK'] - Nombre del atributo de la clave de ordenación
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object|null>} - Ítem encontrado o null si no existe
   */
  async getItem(keyOrPK, sk, options = {}, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    let key;

    // Determinar si se está usando el formato de objeto o el formato de PK/SK separados
    if (typeof keyOrPK === 'object' && keyOrPK !== null && sk === undefined) {
      // Formato de objeto: { PK: 'valor1', SK: 'valor2' }
      key = keyOrPK;
    } else if (typeof keyOrPK === 'string' || typeof keyOrPK === 'number') {
      // Formato de PK/SK separados
      const pkName = options.pkName || 'PK';
      const skName = options.skName || 'SK';

      key = { [pkName]: keyOrPK };

      // Agregar SK solo si está definido
      if (sk !== undefined) {
        key[skName] = sk;
      } else {
        throw new Error(
          'Se requiere el valor de la clave de ordenación (SK) cuando se usa el formato PK/SK',
        );
      }
    } else {
      throw new Error('Formato de clave inválido');
    }

    const params = {
      TableName: tableName,
      Key: marshall(key),
    };

    try {
      const command = new GetItemCommand(params);
      const { Item } = await this.client.send(command);

      if (!Item) {
        return null;
      }

      return unmarshall(Item);
    } catch (error) {
      console.error('Error al obtener el ítem de DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Elimina un ítem de la tabla por su clave primaria
   * @param {Object} key - Objeto con la clave primaria
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   */
  async deleteItem(key, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    const params = {
      TableName: tableName,
      Key: marshall(key),
    };

    try {
      const command = new DeleteItemCommand(params);
      const response = await this.client.send(command);
      return response;
    } catch (error) {
      console.error('Error al eliminar el ítem de DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Actualiza un ítem existente en la tabla
   * @param {Object} key - Objeto con la clave primaria
   * @param {Object} updates - Objeto con los campos a actualizar
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object>} - Ítem actualizado
   */
  async updateItem(key, updates, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    // Construir expresiones de actualización
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([field, value], index) => {
      if (field in key) return; // No actualizar claves primarias

      const fieldName = `#field${index}`;
      const valueName = `:value${index}`;

      updateExpression.push(`${fieldName} = ${valueName}`);
      expressionAttributeNames[fieldName] = field;
      expressionAttributeValues[valueName] = value;
    });

    if (updateExpression.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    const params = {
      TableName: tableName,
      Key: marshall(key),
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: 'ALL_NEW',
    };

    try {
      const command = new UpdateItemCommand(params);
      const { Attributes } = await this.client.send(command);
      return unmarshall(Attributes);
    } catch (error) {
      console.error('Error al actualizar el ítem en DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Realiza un escaneo completo de la tabla
   * @param {Object} [options] - Opciones adicionales para el escaneo
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Array>} - Lista de ítems encontrados
   */
  async scanTable(options = {}, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    const params = {
      TableName: tableName,
      ...options,
    };

    try {
      const command = new ScanCommand(params);
      const { Items, LastEvaluatedKey } = await this.client.send(command);

      const result = {
        items: Items ? Items.map((item) => unmarshall(item)) : [],
        lastEvaluatedKey: LastEvaluatedKey
          ? unmarshall(LastEvaluatedKey)
          : undefined,
      };

      return result;
    } catch (error) {
      console.error('Error al escanear la tabla DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Realiza una consulta en la tabla usando índices y condiciones
   * @param {Object} params - Parámetros para la consulta
   * @param {string} [params.IndexName] - Nombre del índice secundario global (GSI) a utilizar
   * @param {string} [params.KeyConditionExpression] - Expresión de condición para la clave
   * @param {Object} [params.ExpressionAttributeNames] - Nombres de atributos para la expresión
   * @param {Object} [params.ExpressionAttributeValues] - Valores de atributos para la expresión
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object>} - Objeto con los ítems encontrados y la última clave evaluada
   */
  async queryTable(params = {}, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    // Convertir los ExpressionAttributeValues a formato DynamoDB si existen
    const queryParams = {
      TableName: tableName,
      ...params,
    };
    
    if (queryParams.ExpressionAttributeValues) {
      queryParams.ExpressionAttributeValues = marshall(
        queryParams.ExpressionAttributeValues,
      );
    }

    try {
      const command = new QueryCommand(queryParams);
      const { Items, LastEvaluatedKey } = await this.client.send(command);

      const result = {
        items: Items ? Items.map((item) => unmarshall(item)) : [],
        lastEvaluatedKey: LastEvaluatedKey
          ? unmarshall(LastEvaluatedKey)
          : undefined,
      };

      return result;
    } catch (error) {
      console.error('Error al consultar la tabla DynamoDB:', error);
      throw error;
    }
  }

  /**
   * Escribe múltiples ítems en lote
   * @param {Array<Object>} items - Lista de ítems a escribir
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   */
  /**
   * Realiza una consulta usando un índice secundario global (GSI)
   * @param {Object} options - Opciones para la consulta por GSI
   * @param {string} options.indexName - Nombre del índice secundario global
   * @param {string} options.hashKey - Nombre del atributo hash key del índice
   * @param {any} options.hashValue - Valor del atributo hash key
   * @param {string} [options.rangeKey] - Nombre del atributo range key del índice (opcional)
   * @param {string} [options.rangeOperator] - Operador para la range key (=, <, <=, >, >=, BETWEEN, begins_with)
   * @param {any|Array<any>} [options.rangeValue] - Valor o valores para la range key
   * @param {boolean} [options.scanIndexForward=true] - Dirección del orden (true: ascendente, false: descendente)
   * @param {number} [options.limit] - Límite de resultados a devolver
   * @param {Object} [options.startKey] - Clave para iniciar la consulta (para paginación)
   * @param {string} [tableName] - Nombre de la tabla (opcional)
   * @returns {Promise<Object>} - Objeto con los ítems encontrados y la última clave evaluada
   */
  async queryByGSI(options, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    if (!options.indexName) {
      throw new Error('Nombre del índice (indexName) no especificado');
    }

    if (!options.hashKey || options.hashValue === undefined) {
      throw new Error('Hash key y su valor son requeridos');
    }

    // Construir la expresión de condición
    let keyConditionExpression = `#${options.hashKey} = :${options.hashKey}`;
    const expressionAttributeNames = {
      [`#${options.hashKey}`]: options.hashKey,
    };
    const expressionAttributeValues = {
      [`:${options.hashKey}`]: options.hashValue,
    };

    // Añadir range key si está especificada
    if (options.rangeKey && options.rangeValue !== undefined) {
      const rangeKey = options.rangeKey;
      expressionAttributeNames[`#${rangeKey}`] = rangeKey;

      // Manejar diferentes operadores
      switch (options.rangeOperator) {
        case 'BETWEEN':
          if (
            !Array.isArray(options.rangeValue) ||
            options.rangeValue.length !== 2
          ) {
            throw new Error(
              'Para el operador BETWEEN, rangeValue debe ser un array con dos elementos',
            );
          }
          keyConditionExpression += ` AND #${rangeKey} BETWEEN :${rangeKey}0 AND :${rangeKey}1`;
          expressionAttributeValues[`:${rangeKey}0`] = options.rangeValue[0];
          expressionAttributeValues[`:${rangeKey}1`] = options.rangeValue[1];
          break;

        case 'begins_with':
          keyConditionExpression += ` AND begins_with(#${rangeKey}, :${rangeKey})`;
          expressionAttributeValues[`:${rangeKey}`] = options.rangeValue;
          break;

        default:
          // =, <, <=, >, >=
          const operator = options.rangeOperator || '=';
          keyConditionExpression += ` AND #${rangeKey} ${operator} :${rangeKey}`;
          expressionAttributeValues[`:${rangeKey}`] = options.rangeValue;
      }
    }

    // Construir los parámetros de la consulta
    const params = {
      TableName: tableName,
      IndexName: options.indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: options.scanIndexForward !== false, // true por defecto (ascendente)
    };

    // Añadir límite si está especificado
    if (options.limit) {
      params.Limit = options.limit;
    }

    // Añadir clave de inicio para paginación
    if (options.startKey) {
      params.ExclusiveStartKey = marshall(options.startKey);
    }

    // Usar el método queryTable existente
    return this.queryTable(params, tableName);
  }

  async batchWrite(items, tableName = this.tableName) {
    if (!tableName) {
      throw new Error('Nombre de tabla no especificado');
    }

    // Dividir los ítems en lotes de 25 (límite de DynamoDB)
    const batches = [];
    for (let i = 0; i < items.length; i += 25) {
      batches.push(items.slice(i, i + 25));
    }

    const results = [];

    for (const batch of batches) {
      const putRequests = batch.map((item) => ({
        PutRequest: {
          Item: marshall(item, { removeUndefinedValues: true }),
        },
      }));

      const params = {
        RequestItems: {
          [tableName]: putRequests,
        },
      };

      try {
        const command = new BatchWriteItemCommand(params);
        const response = await this.client.send(command);
        results.push(response);
      } catch (error) {
        console.error('Error en operación batchWrite:', error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Realiza una operación de transacción de escritura que puede incluir operaciones de put, update y delete
   * @param {Array<Object>} transactItems - Array de objetos con las operaciones a realizar en la transacción
   * @param {boolean} [throwIfFails=true] - Si es true, lanza un error si la transacción falla
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   *
   * Ejemplo de uso:
   * const transactItems = [
   *   {
   *     Put: {
   *       TableName: 'MiTabla',
   *       Item: { PK: 'user#123', SK: 'metadata', name: 'Juan' }
   *     }
   *   },
   *   {
   *     Update: {
   *       TableName: 'MiTabla',
   *       Key: { PK: 'counter', SK: 'total' },
   *       UpdateExpression: 'SET #count = #count + :inc',
   *       ExpressionAttributeNames: { '#count': 'count' },
   *       ExpressionAttributeValues: { ':inc': 1 }
   *     }
   *   },
   *   {
   *     Delete: {
   *       TableName: 'MiTabla',
   *       Key: { PK: 'session#abc', SK: 'metadata' }
   *     }
   *   }
   * ];
   *
   * await dynamoDBManager.transactWrite(transactItems);
   */
  async transactWrite(transactItems, throwIfFails = true) {
    // Procesar los items para aplicar marshall a Key, Item y ExpressionAttributeValues
    const processedItems = transactItems.map((item) => {
      const processedItem = { ...item };

      // Procesar Put
      if (processedItem.Put) {
        processedItem.Put = {
          TableName: this.tableName,
          ...processedItem.Put,
          Item: marshall(processedItem.Put, {
            removeUndefinedValues: true,
          }),
        };
      }

      // Procesar Update
      if (processedItem.Update) {
        const { Key, ...parsedItems } = this.parserItemsToUpdate(
          processedItem.Update,
        );
        processedItem.Update = {
          TableName: this.tableName,
          ...parsedItems,
          Key: marshall(Key, {
            removeUndefinedValues: true,
          }),
        };

        // Procesar ExpressionAttributeValues si existe
        if (processedItem.Update.ExpressionAttributeValues) {
          processedItem.Update.ExpressionAttributeValues = marshall(
            processedItem.Update.ExpressionAttributeValues,
            { removeUndefinedValues: true },
          );
        }
      }

      // Procesar Delete
      if (processedItem.Delete) {
        processedItem.Delete = {
          TableName: this.tableName,
          ...processedItem.Delete,
          Key: marshall(processedItem.Delete.Key, {
            removeUndefinedValues: true,
          }),
        };
      }

      return processedItem;
    });

    try {
      const command = new TransactWriteItemsCommand({
        TransactItems: processedItems,
      });

      const response = await this.client.send(command);
      return response;
    } catch (error) {
      console.error('Error en operación transactWrite:', error);
      if (throwIfFails) {
        throw error;
      }
      return { error };
    }
  }

  /**
   * Realiza una operación de transacción que incluye solo operaciones de tipo PUT
   * @param {Array<Object>} items - Array de objetos con los ítems a insertar
   * @param {Array<string>} [tableNames] - Array de nombres de tabla para cada ítem (opcional)
   * @param {boolean} [throwIfFails=true] - Si es true, lanza un error si la transacción falla
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   */
  async transactPut(items, tableNames = [], throwIfFails = true) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Se debe proporcionar un array de ítems no vacío');
    }

    const transactItems = items.map((item, index) => {
      const tableName = tableNames[index] || this.tableName;

      if (!tableName) {
        throw new Error(
          `Nombre de tabla no especificado para el ítem en posición ${index}`,
        );
      }

      return {
        Put: {
          TableName: tableName,
          Item: item,
        },
      };
    });

    return this.transactWrite(transactItems, throwIfFails);
  }

  /**
   * Realiza una operación de transacción que incluye solo operaciones de tipo DELETE
   * @param {Array<Object>} keys - Array de objetos con las claves de los ítems a eliminar
   * @param {Array<string>} [tableNames] - Array de nombres de tabla para cada ítem (opcional)
   * @param {boolean} [throwIfFails=true] - Si es true, lanza un error si la transacción falla
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   */
  async transactDelete(keys, tableNames = [], throwIfFails = true) {
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      throw new Error('Se debe proporcionar un array de claves no vacío');
    }

    const transactItems = keys.map((key, index) => {
      const tableName = tableNames[index] || this.tableName;

      if (!tableName) {
        throw new Error(
          `Nombre de tabla no especificado para la clave en posición ${index}`,
        );
      }

      return {
        Delete: {
          TableName: tableName,
          Key: key,
        },
      };
    });

    return this.transactWrite(transactItems, throwIfFails);
  }

  /**
   * Realiza una operación de transacción que incluye solo operaciones de tipo UPDATE
   * @param {Array<Object>} updateItems - Array de objetos con las operaciones de actualización
   * @param {Array<string>} [tableNames] - Array de nombres de tabla para cada operación (opcional)
   * @param {boolean} [throwIfFails=true] - Si es true, lanza un error si la transacción falla
   * @returns {Promise<Object>} - Respuesta de DynamoDB
   *
   * Ejemplo de updateItems:
   * const updateItems = [
   *   {
   *     Key: { PK: 'user#123', SK: 'metadata' },
   *     UpdateExpression: 'SET #name = :name, #age = :age',
   *     ExpressionAttributeNames: { '#name': 'name', '#age': 'age' },
   *     ExpressionAttributeValues: { ':name': 'Juan', ':age': 30 }
   *   }
   * ];
   */
  async transactUpdate(updateItems, tableNames = [], throwIfFails = true) {
    if (
      !updateItems ||
      !Array.isArray(updateItems) ||
      updateItems.length === 0
    ) {
      throw new Error(
        'Se debe proporcionar un array de operaciones de actualización no vacío',
      );
    }

    const transactItems = updateItems.map((item, index) => {
      const tableName = tableNames[index] || this.tableName;

      if (!tableName) {
        throw new Error(
          `Nombre de tabla no especificado para la operación en posición ${index}`,
        );
      }

      if (!item.Key) {
        throw new Error(
          `Se debe proporcionar una clave para la operación en posición ${index}`,
        );
      }

      if (!item.UpdateExpression) {
        throw new Error(
          `Se debe proporcionar una expresión de actualización para la operación en posición ${index}`,
        );
      }

      return {
        Update: {
          TableName: tableName,
          Key: item.Key,
          UpdateExpression: item.UpdateExpression,
          ExpressionAttributeNames: item.ExpressionAttributeNames || {},
          ExpressionAttributeValues: item.ExpressionAttributeValues || {},
        },
      };
    });

    return this.transactWrite(transactItems, throwIfFails);
  }
  parserItemsToUpdate(items) {
    const scheme = Object.entries(items).reduce(
      (acu, [key, value]) => {
        if (Object.values(this.keys).includes(key)) {
          acu.Key[key] = value;
          return acu;
        }
        acu.UpdateExpression.push(`#${key} = :${key}`);
        acu.ExpressionAttributeNames = {
          [`#${key}`]: key,
          ...acu.ExpressionAttributeNames,
        };
        acu.ExpressionAttributeValues = {
          [`:${key}`]: value,
          ...acu.ExpressionAttributeValues,
        };
        return acu;
      },
      {
        Key: {},
        UpdateExpression: [],
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
      },
    );
    scheme.UpdateExpression = 'SET ' + scheme.UpdateExpression.join(',');

    return scheme;
  }
  /**
   * Obtiene movimientos de una wallet usando begins_with en la SK.
   * Permite obtener todos los movimientos o filtrar por tipo y/o fecha de inicio.
   *
   * @param {string} walletAddress La dirección de la wallet.
   * @param {number} limit El número máximo de movimientos a devolver por página.
   * @param {object} [exclusiveStartKey] La clave de inicio para la paginación.
   * @param {string} [movementType] Opcional. El tipo de movimiento a filtrar (ej. 'FUNDING', 'CREDIT_PURCHASE', 'DATA_ANCHOR').
   * @param {string} [startDate] Opcional. La fecha de inicio del rango (formato YYYY-MM-DD).
   * @returns {Promise<{items: Array<object>, lastEvaluatedKey: object|undefined}>}
   */
  async getWalletMovements({
    walletAddress,
    limit = 10,
    exclusiveStartKey = undefined,
    movementType = undefined,
    startDate = undefined,
    endDate = undefined,
  }) {
    const pkValue = walletAddress;
    const expressionAttributeValues = {
      ':pk': pkValue,
    };

    let keyConditionExpression = '';

    // Evaluamos los distintos casos
    if (movementType && startDate) {
      // Caso: filtro por tipo + fecha de inicio
      let skStart, skEnd;

      if (endDate) {
        // Con fecha de fin específica
        skStart = `TX#${movementType}#${startDate}T00:00:00.000Z#`;
        skEnd = `TX#${movementType}#${endDate}T23:59:59.999Z#`;
      } else {
        // Solo fecha de inicio - hasta el presente
        skStart = `TX#${movementType}#${startDate}T00:00:00.000Z#`;
        // Usamos un timestamp muy alto para el futuro
        skEnd = `TX#${movementType}#9999-12-31T23:59:59.999Z#`;
      }

      keyConditionExpression = `${this.keys.pK} = :pk AND ${this.keys.sK} BETWEEN :sk_start AND :sk_end`;
      expressionAttributeValues[':sk_start'] = skStart;
      expressionAttributeValues[':sk_end'] = skEnd;
    } else if (movementType) {
      // Caso: solo tipo de movimiento
      const skPrefix = `TX#${movementType}#`;
      keyConditionExpression = `${this.keys.pK} = :pk AND begins_with(${this.keys.sK}, :sk_prefix)`;
      expressionAttributeValues[':sk_prefix'] = skPrefix;
    } else if (startDate) {
      // Caso: solo fecha de inicio (todos los tipos)
      let skStart, skEnd;

      if (endDate) {
        // Con rango de fechas específico
        skStart = `TX#${startDate}T00:00:00.000Z#`;
        skEnd = `TX#${endDate}T23:59:59.999Z#`;
      } else {
        // Solo fecha de inicio
        skStart = `TX#${startDate}T00:00:00.000Z#`;
        skEnd = `TX#9999-12-31T23:59:59.999Z#`; // Timestamp muy alto
      }

      keyConditionExpression = `${this.keys.pK} = :pk AND ${this.keys.sK} BETWEEN :sk_start AND :sk_end`;
      expressionAttributeValues[':sk_start'] = skStart;
      expressionAttributeValues[':sk_end'] = skEnd;
    } else {
      // Caso base: sin filtros adicionales
      const skPrefix = 'TX#';
      keyConditionExpression = `${this.keys.pK} = :pk AND begins_with(${this.keys.sK}, :sk_prefix)`;
      expressionAttributeValues[':sk_prefix'] = skPrefix;
    }

    const params = {
      TableName: this.tableName,
      //IndexName: 'GSI_CreatedAt',
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ScanIndexForward: false, // Más recientes primero
      Limit: limit,
    };

    if (exclusiveStartKey) {
      params.ExclusiveStartKey = marshall(exclusiveStartKey);
    }

    //console.log(JSON.stringify(params, null, 2));
    try {
      const command = new QueryCommand(params);
      const response = await this.client.send(command);

      return {
        items: response?.Items?.map((item) => unmarshall(item)) || [],
        lastEvaluatedKey:
          response?.LastEvaluatedKey && unmarshall(response.LastEvaluatedKey),
      };
    } catch (error) {
      console.error('Error al consultar DynamoDB:', error);
      throw new Error(`Error al obtener movimientos: ${error.message}`);
    }
  }
}

export default DynamoDBManager;
