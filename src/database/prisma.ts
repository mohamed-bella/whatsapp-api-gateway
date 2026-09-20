import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' }
  ]
});

prisma.$on('error' as never, (e: any) => {
  logger.error({ err: e.message }, 'Prisma database error');
});

prisma.$on('warn' as never, (e: any) => {
  logger.warn({ warning: e.message }, 'Prisma database warning');
});

/**
 * Checks database connectivity.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Database health check failed');
    return false;
  }
}
