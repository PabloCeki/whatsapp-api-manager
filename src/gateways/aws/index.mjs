import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import postMessageServiceBuilder from "./postMessageService.mjs";
import {fromIni} from "@aws-sdk/credential-providers";
import config from 'config'
const { websocketUri = '',profile } = config
const client = new ApiGatewayManagementApiClient({ endpoint: websocketUri,
    ...(profile) ? { credentials: fromIni({ profile }) } : {}, });

export const postMessageService = postMessageServiceBuilder({
    client,
    PostToConnectionCommand,
});
