import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireApiToken } from '../middlewares/auth';
import { validateBody } from '../middlewares/validate';
import { normalizePhoneNumber } from '../../whatsapp/phone';
import { messageQueue } from '../../queue/messageQueue';

const router = Router();

// 1. Text message schema
const sendTextSchema = z.object({
  to: z.string({ required_error: 'Field "to" is required' }).min(5, 'Invalid phone number'),
  message: z.string({ required_error: 'Field "message" is required' }).min(1, 'Message cannot be empty')
});

// 2. Image message schema
const sendImageSchema = z.object({
  to: z.string({ required_error: 'Field "to" is required' }).min(5, 'Invalid phone number'),
  url: z.string({ required_error: 'Field "url" is required' }).url('Valid image URL is required'),
  caption: z.string().optional()
});

// 3. Document message schema
const sendDocumentSchema = z.object({
  to: z.string({ required_error: 'Field "to" is required' }).min(5, 'Invalid phone number'),
  url: z.string({ required_error: 'Field "url" is required' }).url('Valid document URL is required'),
  filename: z.string({ required_error: 'Field "filename" is required' }).min(1, 'Filename is required'),
  caption: z.string().optional(),
  mimetype: z.string().optional()
});

/**
 * POST /api/v1/send
 * Sends a standard text message.
 */
router.post(
  '/',
  requireApiToken,
  validateBody(sendTextSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, message } = req.body;
      let normalizedTo: string;
      try {
        normalizedTo = normalizePhoneNumber(to);
      } catch (err: any) {
        const phoneErr: any = new Error(err.message || 'Invalid phone number');
        phoneErr.code = 'INVALID_PHONE_NUMBER';
        return next(phoneErr);
      }

      const result = await messageQueue.enqueue({
        type: 'text',
        to: normalizedTo,
        body: message,
        apiTokenId: req.apiToken?.id
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        to: normalizedTo
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/send/image
 * Sends an image message.
 */
router.post(
  '/image',
  requireApiToken,
  validateBody(sendImageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, url, caption } = req.body;
      let normalizedTo: string;
      try {
        normalizedTo = normalizePhoneNumber(to);
      } catch (err: any) {
        const phoneErr: any = new Error(err.message || 'Invalid phone number');
        phoneErr.code = 'INVALID_PHONE_NUMBER';
        return next(phoneErr);
      }

      const result = await messageQueue.enqueue({
        type: 'image',
        to: normalizedTo,
        url,
        caption,
        apiTokenId: req.apiToken?.id
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        to: normalizedTo
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/send/document
 * Sends a document message.
 */
router.post(
  '/document',
  requireApiToken,
  validateBody(sendDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, url, filename, caption, mimetype } = req.body;
      let normalizedTo: string;
      try {
        normalizedTo = normalizePhoneNumber(to);
      } catch (err: any) {
        const phoneErr: any = new Error(err.message || 'Invalid phone number');
        phoneErr.code = 'INVALID_PHONE_NUMBER';
        return next(phoneErr);
      }

      const result = await messageQueue.enqueue({
        type: 'document',
        to: normalizedTo,
        url,
        filename,
        caption,
        mimetype,
        apiTokenId: req.apiToken?.id
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        to: normalizedTo
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
