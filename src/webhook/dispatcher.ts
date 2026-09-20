import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../database/prisma';
import { WebhookEventPayload } from './types';

export class WebhookDispatcher {
  private static instance: WebhookDispatcher;

  private constructor() {}

  public static getInstance(): WebhookDispatcher {
    if (!WebhookDispatcher.instance) {
      WebhookDispatcher.instance = new WebhookDispatcher();
    }
    return WebhookDispatcher.instance;
  }

  /**
   * Generates HMAC-SHA256 signature for a payload.
   */
  public generateSignature(payloadString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Dispatches a webhook event to the configured WEBHOOK_URL.
   * Includes signature header and persists the delivery result to the database.
   */
  public async dispatch(event: string, data: any): Promise<void> {
    const webhookUrl = env.WEBHOOK_URL;
    if (!webhookUrl) {
      logger.debug('No WEBHOOK_URL configured, skipping webhook dispatch');
      return;
    }

    const payload: WebhookEventPayload = {
      event,
      timestamp: Math.floor(Date.now() / 1000),
      data
    };

    const payloadString = JSON.stringify(payload);
    const signature = env.WEBHOOK_SECRET
      ? this.generateSignature(payloadString, env.WEBHOOK_SECRET)
      : '';

    // Create initial delivery record in DB
    let deliveryRecordId: string | null = null;
    try {
      const record = await prisma.webhookDelivery.create({
        data: {
          event,
          payload: payload as any,
          endpoint: webhookUrl,
          status: 'PENDING',
          attempts: 0
        }
      });
      deliveryRecordId = record.id;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to record webhook delivery in database');
    }

    // Trigger delivery with retry in background
    this.sendWithRetry(webhookUrl, payload, payloadString, signature, deliveryRecordId, 1);
  }

  private async sendWithRetry(
    url: string,
    payload: WebhookEventPayload,
    payloadString: string,
    signature: string,
    deliveryRecordId: string | null,
    attempt: number
  ): Promise<void> {
    const maxRetries = env.MAX_RETRIES;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WhatsApp-Gateway-Webhook/1.0'
    };

    if (signature) {
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    try {
      const response = await axios.post(url, payloadString, {
        headers,
        timeout: 10000
      });

      logger.info(
        { url, event: payload.event, status: response.status, attempt },
        'Webhook delivered successfully'
      );

      if (deliveryRecordId) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryRecordId },
          data: {
            status: 'SUCCESS',
            responseStatus: response.status,
            responseBody: typeof response.data === 'string' ? response.data.slice(0, 500) : JSON.stringify(response.data).slice(0, 500),
            attempts: attempt
          }
        }).catch(() => {});
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errorMsg = err.message || 'Unknown network error';
      logger.warn(
        { url, attempt, maxRetries, status, error: errorMsg },
        'Webhook delivery attempt failed'
      );

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        setTimeout(() => {
          this.sendWithRetry(url, payload, payloadString, signature, deliveryRecordId, attempt + 1);
        }, backoffMs);
      } else {
        logger.error(
          { url, attempts: attempt, error: errorMsg },
          'Webhook delivery failed after maximum retries'
        );

        if (deliveryRecordId) {
          await prisma.webhookDelivery.update({
            where: { id: deliveryRecordId },
            data: {
              status: 'FAILED',
              responseStatus: status || null,
              errorMessage: errorMsg,
              attempts: attempt
            }
          }).catch(() => {});
        }
      }
    }
  }
}

export const webhookDispatcher = WebhookDispatcher.getInstance();
