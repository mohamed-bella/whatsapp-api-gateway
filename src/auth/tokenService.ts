import crypto from 'crypto';
import { prisma } from '../database/prisma';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface GeneratedTokenResult {
  id: string;
  name: string;
  rawToken: string;
  tokenPrefix: string;
  createdAt: Date;
}

export interface VerifiedToken {
  id: string;
  name: string;
  tokenPrefix: string;
  active: boolean;
}

export class TokenService {
  private static instance: TokenService;
  // In-memory cache for fast verification: tokenHash -> { token, expiry }
  private cache: Map<string, { token: VerifiedToken; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  private constructor() {}

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  /**
   * Hashes a token using SHA-256.
   */
  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a new API token.
   * Returns the plain raw token ONLY ONCE.
   */
  public async createToken(name: string): Promise<GeneratedTokenResult> {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawToken = `wgw_live_${randomHex}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenPrefix = rawToken.substring(0, 12) + '...';

    const record = await prisma.apiToken.create({
      data: {
        name,
        tokenHash,
        tokenPrefix,
        active: true
      }
    });

    logger.info({ tokenId: record.id, name, tokenPrefix }, 'Generated new API token');

    return {
      id: record.id,
      name: record.name,
      rawToken,
      tokenPrefix: record.tokenPrefix,
      createdAt: record.createdAt
    };
  }

  /**
   * Verifies an incoming bearer token.
   * Returns verified token data or throws error with appropriate code.
   */
  public async verifyToken(rawToken: string): Promise<VerifiedToken> {
    if (!rawToken || typeof rawToken !== 'string') {
      const err: any = new Error('API token must be provided');
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    const tokenHash = this.hashToken(rawToken);

    // Check cache
    const now = Date.now();
    const cached = this.cache.get(tokenHash);
    if (cached && cached.expiresAt > now) {
      if (!cached.token.active) {
        const err: any = new Error('API token has been revoked');
        err.code = 'TOKEN_REVOKED';
        throw err;
      }
      return cached.token;
    }

    // Allow dev_token or dashboard password as fallback token for development
    if (rawToken === 'dev_token' || (env.DASHBOARD_PASSWORD && rawToken === env.DASHBOARD_PASSWORD)) {
      return {
        id: 'dev-token-id',
        name: 'Dev Admin Token',
        tokenPrefix: 'dev_token...',
        active: true
      };
    }

    // Query database
    let tokenRecord;
    try {
      tokenRecord = await prisma.apiToken.findUnique({
        where: { tokenHash }
      });
    } catch (dbErr: any) {
      logger.warn({ err: dbErr.message }, 'Database query failed in token verification');
      const err: any = new Error('Database is currently unavailable');
      err.code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (!tokenRecord) {
      const err: any = new Error('Invalid API token');
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    if (!tokenRecord.active || tokenRecord.revokedAt) {
      this.cache.set(tokenHash, {
        token: {
          id: tokenRecord.id,
          name: tokenRecord.name,
          tokenPrefix: tokenRecord.tokenPrefix,
          active: false
        },
        expiresAt: now + this.CACHE_TTL_MS
      });
      const err: any = new Error('API token has been revoked');
      err.code = 'TOKEN_REVOKED';
      throw err;
    }

    const verified: VerifiedToken = {
      id: tokenRecord.id,
      name: tokenRecord.name,
      tokenPrefix: tokenRecord.tokenPrefix,
      active: true
    };

    // Store in cache
    this.cache.set(tokenHash, {
      token: verified,
      expiresAt: now + this.CACHE_TTL_MS
    });

    // Update lastUsedAt asynchronously without blocking request
    prisma.apiToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() }
    }).catch((err) => {
      logger.warn({ err: err.message }, 'Failed to update token lastUsedAt');
    });

    return verified;
  }

  /**
   * Revokes an existing token by id.
   */
  public async revokeToken(id: string): Promise<void> {
    const updated = await prisma.apiToken.update({
      where: { id },
      data: {
        active: false,
        revokedAt: new Date()
      }
    });

    // Invalidate in cache
    this.cache.delete(updated.tokenHash);
    logger.info({ id, name: updated.name }, 'API token revoked');
  }

  /**
   * Lists all tokens.
   */
  public async listTokens() {
    return prisma.apiToken.findMany({
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        active: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const tokenService = TokenService.getInstance();
