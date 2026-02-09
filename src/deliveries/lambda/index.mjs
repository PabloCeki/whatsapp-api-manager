import execute from './executeHelper.mjs';
import {
sendMessageController,
startSessionController,
} from '../../controllers/index.mjs';

export const handlerRequests = async (event, _context, _callback) => {
  const isSQS = event.Records && event.Records.length > 0;

  if (isSQS) {
    return execute({
      event,
      functionController: sendMessageController,
    });
  }
  switch (true) {
    case /^\/session\/create$/.test(event.path):
      return execute({
        event,
        functionController: startSessionController,
      });
    case /^\/session\/send-message$/.test(event.path):
      return execute({
        event,
        functionController: sendMessageController,
      });
    default:
      return { status: 404, error: 'Not Found' };
  }
};
