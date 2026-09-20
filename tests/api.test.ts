import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { tokenService } from '../src/auth/tokenService';
import { whatsAppClient } from '../src/whatsapp/client';
import { prisma } from '../src/database/prisma';

vi.mock('../src/whatsapp/client', () => ({
  whatsAppClient: {
    init: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      connected: true,
      status: 'open',
      phone: '212612345678'
    }),
    sendTextMessage: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'BAE5TEST12345',
      to: '212612345678'
    }),
    sendImageMessage: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'BAE5TESTIMAGE',
      to: '212612345678'
    }),
    sendDocumentMessage: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'BAE5TESTDOC',
      to: '212612345678'
    }),
    onMessage: vi.fn(),
    onStatusChange: vi.fn(),
    shutdown: vi.fn()
  }
}));

vi.mock('../src/database/prisma', () => ({
  prisma: {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ '1': 1 }]),
    message: {
      create: vi.fn().mockResolvedValue({ id: 'msg-db-123' }),
      update: vi.fn().mockResolvedValue({})
    },
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({})
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: 'delivery-123' }),
      update: vi.fn().mockResolvedValue({})
    }
  },
  checkDatabaseHealth: vi.fn().mockResolvedValue(true)
}));

describe('WhatsApp Gateway API Integration Tests', () => {
  const validToken = 'wgw_live_1111222233334444555566667777888899990000aaaa';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(tokenService, 'verifyToken').mockImplementation(async (tok) => {
      if (tok === validToken) {
        return {
          id: 'token-uuid',
          name: 'Integration Test Client',
          tokenPrefix: 'wgw_live_1111...',
          active: true
        };
      }
      const err: any = new Error('Invalid API token');
      err.code = 'INVALID_TOKEN';
      throw err;
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.whatsapp).toBe('connected');
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('GET /api/v1/status', () => {
    it('should return whatsapp gateway status', async () => {
      const res = await request(app).get('/api/v1/status');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.phone).toBe('212612345678');
      expect(res.body.status).toBe('open');
    });
  });

  describe('POST /api/v1/send Authentication', () => {
    it('should reject request without Authorization header', async () => {
      const res = await request(app)
        .post('/api/v1/send')
        .send({ to: '212612345678', message: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject tokens supplied via query params ?token=', async () => {
      const res = await request(app)
        .post(`/api/v1/send?token=${validToken}`)
        .send({ to: '212612345678', message: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject invalid Bearer token', async () => {
      const res = await request(app)
        .post('/api/v1/send')
        .set('Authorization', 'Bearer invalid_token')
        .send({ to: '212612345678', message: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/v1/send Validation & Dispatch', () => {
    it('should reject request with missing message', async () => {
      const res = await request(app)
        .post('/api/v1/send')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ to: '212612345678' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_MESSAGE');
    });

    it('should reject invalid phone format', async () => {
      const res = await request(app)
        .post('/api/v1/send')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ to: 'invalid-number-xyz', message: 'Hi' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should normalize international number and successfully send text message', async () => {
      const res = await request(app)
        .post('/api/v1/send')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ to: '+212 612-345678', message: 'Hello from gateway' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe('BAE5TEST12345');
      expect(res.body.to).toBe('212612345678');
    });
  });

  describe('POST /api/v1/send/image', () => {
    it('should validate image url and dispatch', async () => {
      const res = await request(app)
        .post('/api/v1/send/image')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          to: '212612345678',
          url: 'https://example.com/voucher.jpg',
          caption: 'Your reservation voucher'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe('BAE5TESTIMAGE');
    });

    it('should reject invalid URL', async () => {
      const res = await request(app)
        .post('/api/v1/send/image')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          to: '212612345678',
          url: 'not-a-valid-url'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/send/document', () => {
    it('should send document message', async () => {
      const res = await request(app)
        .post('/api/v1/send/document')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          to: '212612345678',
          url: 'https://example.com/quotation.pdf',
          filename: 'quotation.pdf',
          caption: 'Here is your quotation'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe('BAE5TESTDOC');
    });
  });
});
