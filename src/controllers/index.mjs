import {
  initializeWSBaileysUsecase,
  getDynamoDBAuthUsecase,
  sendMessageUsecase,
  postWSApiMessageUsecase,
  getWsConnectionIdUsecase,
} from '../usecases/index.mjs';
import startSessionControllerBuilder from './startSessionController.mjs';
import sendMessageControllerBuilder from './sendMessageController.mjs';

export const startSessionController = startSessionControllerBuilder({
  initializeWSBaileysUsecase,
  getDynamoDBAuthUsecase,
  postWSApiMessageUsecase,
  getWsConnectionIdUsecase,
});

export const sendMessageController = sendMessageControllerBuilder({
  sendMessageUsecase,
  initializeWSBaileysUsecase,
  getDynamoDBAuthUsecase,
});
