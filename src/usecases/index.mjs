import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    initAuthCreds,
    BufferJSON,
} from '@whiskeysockets/baileys';
import { whatsappSessionsModel,websocketConnectionsModel } from '../models/dynamo/index.mjs';
import initializeWSBaileysUsecaseBuilder from './initializeWSBaileysUsecase.mjs';
import getDynamoDBAuthUsecaseBuilder from './getDynamoDBAuthUsecase.mjs';
import sendMessageUsecaseBuilder from './sendMessageUsecase.mjs';
import postWSApiMessageUsecaseBuilder from './postWSApiMessageUsecase.mjs';
import getWsConnectionIdUsecaseBuilder from './getWsConnectionIdUsecase.mjs';
import pino from 'pino';
import { postMessageService } from '../gateways/aws/index.mjs';
const logger = pino({ level: 'error' });
export const initializeWSBaileysUsecase = initializeWSBaileysUsecaseBuilder({
    makeWASocket,
    fetchLatestBaileysVersion,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    initAuthCreds,
    BufferJSON,
    logger
})

export const getDynamoDBAuthUsecase = getDynamoDBAuthUsecaseBuilder({
    model: whatsappSessionsModel,
    initAuthCreds,
    BufferJSON,
    logger
})

export const sendMessageUsecase = sendMessageUsecaseBuilder({
    logger
})

export const postWSApiMessageUsecase = postWSApiMessageUsecaseBuilder({
    postMessageService
})

export const getWsConnectionIdUsecase = getWsConnectionIdUsecaseBuilder({
    model: websocketConnectionsModel
})