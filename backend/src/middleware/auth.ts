import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: number;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Single place where admin tokens are verified.
 * Pinning the algorithm prevents accepting tokens signed with an unexpected one.
 */
export function verifyToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || typeof decoded.userId !== 'number') {
      return null;
    }
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authHeader.slice(BEARER_PREFIX.length);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.userId = payload.userId;
  next();
}

/**
 * Sets req.userId when a valid admin token is sent, and never rejects the request.
 * Guests holding a stale token in localStorage must still see the public menu.
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    req.userId = payload.userId;
  }
  next();
}
