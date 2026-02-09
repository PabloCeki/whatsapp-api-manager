import CustomError from './CustomError.mjs';
import { StatusCodes } from 'http-status-codes';

const expiredSessionError = new CustomError(
  'Session expired. Please scan QR again.',
  'WAM0001',
  StatusCodes.UNAUTHORIZED,
);
const sessionClosedError = new CustomError(
  'Session closed. Please scan QR again.',
  'WAM0002',
  StatusCodes.UNAUTHORIZED,
);
const connectionTimeoutError = new CustomError(
  'Connection timeout.',
  'WAM0003',
  StatusCodes.UNAUTHORIZED,
);
export const BAILEYS_ERRORS = {
  EXPIRED_SESSION: expiredSessionError,
  SESSION_CLOSED: sessionClosedError,
  CONNECTION_TIMEOUT: connectionTimeoutError,
};
