import { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger';

const ERROR_STATUS_MAP: Record<string, number> = {
  INVALID_TOKEN: 401,
  TOKEN_REVOKED: 403,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_PHONE_NUMBER: 400,
  INVALID_MESSAGE: 400,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  WHATSAPP_NOT_CONNECTED: 503,
  WHATSAPP_LOGGED_OUT: 503,
  MESSAGE_QUEUE_FULL: 429,
  RATE_LIMITED: 429,
  MESSAGE_SEND_FAILED: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
};

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const code = err.code || 'INTERNAL_ERROR';
  const statusCode = ERROR_STATUS_MAP[code] || (err.status && Number.isInteger(err.status) ? err.status : 500);
  const message = err.message || 'An unexpected error occurred.';

  // Structured logging
  if (statusCode >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path }, 'API Internal Server Error');
  } else {
    logger.warn({ code, message, path: req.path }, 'API Client Error');
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
}
