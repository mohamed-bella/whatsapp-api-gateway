import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './database/prisma';
import { whatsAppClient } from './whatsapp/client';
import { webhookDispatcher } from './webhook/dispatcher';
import { messageQueue } from './queue/messageQueue';
import { errorHandler } from './api/middlewares/errorHandler';
import sendRoutes from './api/routes/send';
import healthRoutes from './api/routes/health';
import tokenRoutes from './api/routes/tokens';
import dashboardRoutes from './dashboard/router';
import { swaggerDocument } from './api/swagger';

const app = express();

// 1. Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false // Allow inline scripts/styles for dashboard
  })
);

// 2. CORS
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
  })
);

// 3. Rate limiting for API
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.'
      }
    });
  }
});

// 4. Request parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 5. OpenAPI Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 6. Routes
app.use('/', healthRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api/v1/send', apiLimiter, sendRoutes);
app.use('/api/v1/tokens', tokenRoutes);

// Root redirect to dashboard
app.get('/', (_req, res) => {
  res.redirect('/dashboard');
});

// 7. 404 handler for unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// 8. Global standardized error handler
app.use(errorHandler);

// Wire incoming WhatsApp messages to Webhook Dispatcher and Database
whatsAppClient.onMessage(async (data) => {
  try {
    // 1. Persist inbound message to database
    await prisma.message.create({
      data: {
        whatsappMessageId: data.messageId,
        direction: 'INBOUND',
        from: data.from,
        to: whatsAppClient.getStatus().phone || 'gateway',
        type: data.type,
        body: data.message,
        status: 'DELIVERED',
        rawPayload: data.rawMessage as any
      }
    });

    // 2. Forward to configured webhook
    await webhookDispatcher.dispatch('message.received', {
      messageId: data.messageId,
      from: data.from,
      message: data.message,
      type: data.type
    });
  } catch (err: any) {
    logger.error({ err: err.message, messageId: data.messageId }, 'Failed to process incoming message pipeline');
  }
});

let server: any;

async function bootstrap() {
  try {
    // Attempt DB connection
    try {
      await prisma.$connect();
      logger.info('Database connected successfully');
    } catch (dbErr: any) {
      logger.warn(
        { err: dbErr.message },
        'Database connection could not be established. Running in standalone mode (WhatsApp Gateway and QR Dashboard are active).'
      );
    }

    // Initialize Baileys WhatsApp client
    if (env.NODE_ENV !== 'test') {
      await whatsAppClient.init();
    }

    server = app.listen(env.PORT, env.HOST, () => {
      logger.info(
        { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
        `🚀 WhatsApp Gateway running at http://${env.HOST}:${env.PORT}`
      );
      logger.info(`📊 Dashboard: http://${env.HOST}:${env.PORT}/dashboard`);
      logger.info(`📚 Swagger Docs: http://${env.HOST}:${env.PORT}/api-docs`);
    });
  } catch (err: any) {
    logger.fatal({ err: err.message }, 'Failed to bootstrap WhatsApp Gateway');
    process.exit(1);
  }
}

// Graceful Shutdown implementation
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP requests
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // 2. Finish safe queue operations
  try {
    await messageQueue.pauseAndDrain();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error draining queue');
  }

  // 3. Close the WhatsApp socket cleanly
  try {
    await whatsAppClient.shutdown();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error shutting down WhatsApp client');
  }

  // 4. Disconnect Prisma PostgreSQL client
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected cleanly');
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error disconnecting Prisma');
  }

  logger.info('Graceful shutdown complete. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export { app, bootstrap, gracefulShutdown };
