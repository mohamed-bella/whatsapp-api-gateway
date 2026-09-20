import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  
  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/whatsapp_gateway?schema=public'),

  // Baileys persistent storage
  AUTH_DIR: z.string().default(process.env.AUTH_DIR || './data/baileys-auth'),

  // Webhook configuration
  WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
  WEBHOOK_SECRET: z.string().default(''),

  // Security & Admin
  DASHBOARD_PASSWORD: z.string().default('admin'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().default(100), // requests per minute for public endpoints
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Message Queue & Throttling (messages per second to WhatsApp)
  MESSAGE_RATE_LIMIT_PER_SEC: z.coerce.number().default(5),
  MAX_RETRIES: z.coerce.number().default(3),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
