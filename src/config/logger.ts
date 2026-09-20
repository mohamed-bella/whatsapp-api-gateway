import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'authorization',
      'token',
      'apiToken',
      'password',
      'WEBHOOK_SECRET',
      'creds',
      'keys',
      'secret'
    ],
    remove: true
  },
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined
});
