import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../database/prisma';
import { whatsAppClient } from '../whatsapp/client';
import { SendMessageResult } from '../whatsapp/types';

export type MessageJobType = 'text' | 'image' | 'document';

export interface MessageJob {
  id: string; // Database message ID
  apiTokenId?: string;
  type: MessageJobType;
  to: string;
  body?: string;
  url?: string;
  filename?: string;
  caption?: string;
  mimetype?: string;
  resolve: (res: SendMessageResult) => void;
  reject: (err: any) => void;
  createdAt: number;
}

export class MessageQueue {
  private static instance: MessageQueue;
  private queue: MessageJob[] = [];
  private isProcessing = false;
  private isPaused = false;
  private maxQueueSize = 1000;
  private minIntervalMs: number;

  private constructor() {
    const rateLimit = env.MESSAGE_RATE_LIMIT_PER_SEC > 0 ? env.MESSAGE_RATE_LIMIT_PER_SEC : 5;
    this.minIntervalMs = Math.ceil(1000 / rateLimit);
  }

  public static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  /**
   * Enqueues an outgoing message for rate-limited delivery.
   */
  public async enqueue(
    jobData: Omit<MessageJob, 'id' | 'resolve' | 'reject' | 'createdAt'>
  ): Promise<SendMessageResult> {
    if (this.isPaused) {
      const err: any = new Error('Service is shutting down. No new messages accepted.');
      err.code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (this.queue.length >= this.maxQueueSize) {
      const err: any = new Error('Message queue is full. Try again later.');
      err.code = 'MESSAGE_QUEUE_FULL';
      throw err;
    }

    // Persist message record in database if connected
    let messageId = 'mem-' + Date.now();
    try {
      const dbRecord = await prisma.message.create({
        data: {
          direction: 'OUTBOUND',
          to: jobData.to,
          from: whatsAppClient.getStatus().phone || 'gateway',
          type: jobData.type,
          body: jobData.body || jobData.caption || null,
          mediaUrl: jobData.url || null,
          filename: jobData.filename || null,
          status: 'QUEUED',
          apiTokenId: jobData.apiTokenId || null
        }
      });
      messageId = dbRecord.id;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Could not persist message to DB. Proceeding with WhatsApp dispatch.');
    }

    return new Promise<SendMessageResult>((resolve, reject) => {
      const job: MessageJob = {
        ...jobData,
        id: messageId,
        resolve,
        reject,
        createdAt: Date.now()
      };

      this.queue.push(job);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift()!;

    try {
      let result: SendMessageResult;

      if (job.type === 'text') {
        result = await whatsAppClient.sendTextMessage({
          to: job.to,
          message: job.body || ''
        });
      } else if (job.type === 'image') {
        result = await whatsAppClient.sendImageMessage({
          to: job.to,
          url: job.url!,
          caption: job.caption
        });
      } else if (job.type === 'document') {
        result = await whatsAppClient.sendDocumentMessage({
          to: job.to,
          url: job.url!,
          filename: job.filename!,
          caption: job.caption,
          mimetype: job.mimetype
        });
      } else {
        throw new Error(`Unsupported message type: ${job.type}`);
      }

      // Update database message status to SENT
      await prisma.message.update({
        where: { id: job.id },
        data: {
          status: 'SENT',
          whatsappMessageId: result.messageId
        }
      }).catch((err) => {
        logger.warn({ err: err.message, id: job.id }, 'Failed to update message sent status');
      });

      job.resolve(result);
    } catch (err: any) {
      logger.error({ err: err.message, id: job.id, to: job.to }, 'Failed to send message via WhatsApp');

      const errorCode = err.code || 'MESSAGE_SEND_FAILED';
      const errorMessage = err.message || 'Failed to send message';

      await prisma.message.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: `${errorCode}: ${errorMessage}`
        }
      }).catch(() => {});

      const formattedError: any = new Error(errorMessage);
      formattedError.code = errorCode;
      job.reject(formattedError);
    } finally {
      // Respect rate limiting interval before next dispatch
      setTimeout(() => {
        this.isProcessing = false;
        this.processNext();
      }, this.minIntervalMs);
    }
  }

  /**
   * Pauses new enqueuing and waits for current jobs to finish.
   */
  public async pauseAndDrain(): Promise<void> {
    this.isPaused = true;
    logger.info({ remainingJobs: this.queue.length }, 'Draining message queue before shutdown...');

    // Wait until current queue is empty or timeout after 10s
    const start = Date.now();
    while (this.queue.length > 0 && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    logger.info('Message queue drained');
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const messageQueue = MessageQueue.getInstance();
