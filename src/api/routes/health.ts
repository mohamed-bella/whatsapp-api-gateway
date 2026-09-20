import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../../database/prisma';
import { whatsAppClient } from '../../whatsapp/client';

const router = Router();
const startTime = Date.now();

/**
 * GET /health
 * Overall system health check.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const isDbHealthy = await checkDatabaseHealth();
  const whatsappStatus = whatsAppClient.getStatus();
  const isWhatsappHealthy = whatsappStatus.connected;

  const status = isDbHealthy ? 'ok' : 'degraded';

  res.status(200).json({
    status,
    database: isDbHealthy ? 'connected' : 'disconnected',
    whatsapp: isWhatsappHealthy ? 'connected' : whatsappStatus.status,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

/**
 * GET /api/v1/status
 * WhatsApp gateway status.
 */
router.get('/api/v1/status', (_req: Request, res: Response) => {
  const wsStatus = whatsAppClient.getStatus();

  res.status(200).json({
    connected: wsStatus.connected,
    phone: wsStatus.phone || null,
    status: wsStatus.status
  });
});

export default router;
