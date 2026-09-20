import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tokenService } from '../../auth/tokenService';
import { env } from '../../config/env';
import { validateBody } from '../middlewares/validate';

const router = Router();

// Middleware to verify admin secret or dashboard password
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers['x-admin-key'] as string;

  const provided = adminKey || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);
  if (!provided || provided !== env.DASHBOARD_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin authorization required'
      }
    });
  }
  next();
}

const createTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100)
});

/**
 * GET /api/v1/tokens
 * Lists all active and revoked tokens.
 */
router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await tokenService.listTokens();
    res.json({ success: true, tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/tokens
 * Creates a new API token.
 */
router.post(
  '/',
  requireAdmin,
  validateBody(createTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tokenService.createToken(req.body.name);
      res.status(201).json({
        success: true,
        token: result
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/tokens/:id
 * Revokes an existing API token.
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await tokenService.revokeToken(id);
    res.json({ success: true, message: 'Token revoked successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
