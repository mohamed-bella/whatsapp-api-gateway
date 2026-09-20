import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenService } from '../src/auth/tokenService';
import { prisma } from '../src/database/prisma';

vi.mock('../src/database/prisma', () => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

describe('TokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a token with prefix and sha256 hash', async () => {
    (prisma.apiToken.create as any).mockResolvedValue({
      id: 'token-uuid-123',
      name: 'Test Service',
      tokenHash: 'mock-hash',
      tokenPrefix: 'wgw_live_1234...',
      active: true,
      createdAt: new Date()
    });

    const result = await tokenService.createToken('Test Service');
    expect(result.rawToken).toMatch(/^wgw_live_[0-9a-f]{48}$/);
    expect(result.name).toBe('Test Service');
    expect(prisma.apiToken.create).toHaveBeenCalledOnce();
  });

  it('should verify a valid token', async () => {
    const rawToken = 'wgw_live_abcdef1234567890abcdef1234567890abcdef12345678';
    const hash = tokenService.hashToken(rawToken);

    (prisma.apiToken.findUnique as any).mockResolvedValue({
      id: 'token-123',
      name: 'Client App',
      tokenHash: hash,
      tokenPrefix: rawToken.substring(0, 12) + '...',
      active: true,
      revokedAt: null
    });
    (prisma.apiToken.update as any).mockResolvedValue({});

    const verified = await tokenService.verifyToken(rawToken);
    expect(verified.id).toBe('token-123');
    expect(verified.active).toBe(true);
  });

  it('should throw INVALID_TOKEN for non-existent token', async () => {
    (prisma.apiToken.findUnique as any).mockResolvedValue(null);

    await expect(tokenService.verifyToken('invalid-token')).rejects.toThrow('Invalid API token');
  });

  it('should throw TOKEN_REVOKED for revoked token', async () => {
    const rawToken = 'wgw_live_revoked_token_1234567890abcdef12345678';
    const hash = tokenService.hashToken(rawToken);

    (prisma.apiToken.findUnique as any).mockResolvedValue({
      id: 'token-revoked',
      name: 'Revoked App',
      tokenHash: hash,
      tokenPrefix: 'wgw_live_rev...',
      active: false,
      revokedAt: new Date()
    });

    await expect(tokenService.verifyToken(rawToken)).rejects.toThrow('API token has been revoked');
  });
});
