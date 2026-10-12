import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: number;
}

const BEARER_PREFIX = 'Bearer ';
const ALGORITHM = 'HS256';

/** Issues an admin token, valid until it expires or the user's token version changes. */
export function signToken(user: { id: number; tokenVersion: number }): string {
  return jwt.sign({ userId: user.id, tv: user.tokenVersion }, config.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwtExpiresIn,
  });
}

function decodeToken(token: string): { userId: number; tokenVersion: number } | null {
  try {
    // Pinning the algorithm prevents accepting tokens signed with an unexpected one
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
    if (typeof decoded !== 'object' || typeof decoded.userId !== 'number' || typeof decoded.tv !== 'number') {
      return null;
    }
    return { userId: decoded.userId, tokenVersion: decoded.tv };
  } catch {
    return null;
  }
}

/**
 * Single place where admin tokens are verified. Returns the user id, or null when
 * the token is invalid, expired, issued before the user's last password change or
 * "log out everywhere" (older token version), or names a user that no longer exists.
 */
export async function verifyToken(token: string): Promise<number | null> {
  const payload = decodeToken(token);
  if (!payload) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    return null;
  }
  return payload.userId;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authHeader.slice(BEARER_PREFIX.length);
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = await verifyToken(token);
  if (userId === null) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.userId = userId;
  next();
}

/**
 * Sets req.userId when a valid admin token is sent, and never rejects the request.
 * Guests holding a stale token in localStorage must still see the public menu.
 */
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  const userId = token ? await verifyToken(token) : null;
  if (userId !== null) {
    req.userId = userId;
  }
  next();
}
