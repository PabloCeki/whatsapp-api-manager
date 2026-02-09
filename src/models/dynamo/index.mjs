import { fromIni } from '@aws-sdk/credential-providers';
import DynamoDBManager from './DynamoDBClient.mjs';
import config from 'config';
const { region, dynamoEndpoint,profile } = config;

export const websocketConnectionsModel = new DynamoDBManager({
    region,
    tableName: 'websocket_connections',
    dynamoEndpoint,
    ...(profile) ? { credentials: fromIni({ profile }) } : {},
    keys: {
        pK: 'connectionId',
      },
});
export const whatsappSessionsModel = new DynamoDBManager({
    region,
    tableName: 'whatsapp_sessions',
    dynamoEndpoint,
    ...(profile) ? { credentials: fromIni({ profile }) } : {},
    keys: {
        pK: 'clientId',
        sK: 'dataType',
      },
});
    