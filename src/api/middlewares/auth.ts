import { Request, Response, NextFunction } from 'express';
import { tokenService, VerifiedToken } from '../../auth/tokenService';

// Extend express Request interface to carry apiToken
declare global {
  namespace Express {
    interface Request {
      apiToken?: VerifiedToken;
    }
  }
}

export async function requireApiToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // Strict check: reject ?token= or ?api_key= query parameters
  if (req.query.token || req.query.api_key) {
    const err: any = new Error(
      'Tokens in query parameters are strictly forbidden. Use Authorization: Bearer <TOKEN> header.'
    );
    err.code = 'INVALID_TOKEN';
    return next(err);
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err: any = new Error('Authorization header with Bearer token is required');
    err.code = 'INVALID_TOKEN';
    return next(err);
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    const err: any = new Error('Bearer token cannot be empty');
    err.code = 'INVALID_TOKEN';
    return next(err);
  }

  try {
    const verified = await tokenService.verifyToken(token);
    req.apiToken = verified;
    next();
  } catch (err) {
    next(err);
  }
}
