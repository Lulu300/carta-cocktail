import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { isApiToken, verifyApiToken, type Principal } from '../services/apiTokenService';

export interface AuthRequest extends Request {
  userId?: number;
  /** Set by protocolAuthMiddleware: false for a read-only API token. */
  canWrite?: boolean;
}

// A read-only API token may only read
const READ_METHODS = new Set(['GET', 'HEAD']);

/** Whether a read-only API token may send this method. */
export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
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
    if (
      typeof decoded !== 'object' ||
      typeof decoded.userId !== 'number' ||
      typeof decoded.tv !== 'number'
    ) {
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

/**
 * Checks a Bearer token: an API token (`carta_…`, F-16) or a session JWT. Returns null when
 * the token is not valid.
 */
async function authenticate(token: string): Promise<Principal | null> {
  if (isApiToken(token)) return verifyApiToken(token);
  const userId = await verifyToken(token);
  return userId === null ? null : { userId, canWrite: true };
}

/** The principal of the request's Bearer token, or a 401 when there is none or it is not valid. */
async function requirePrincipal(req: Request): Promise<Principal> {
  const token = extractBearerToken(req);
  if (!token) throw new UnauthorizedError();

  const principal = await authenticate(token);
  if (!principal) throw new UnauthorizedError('errors.invalidToken');
  return principal;
}

/**
 * Rejects the request with a 401, answered by errorHandler, unless it carries a valid admin
 * token or API token, and with a 403 when a read-only API token sends anything but a read.
 */
export async function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = await requirePrincipal(req);
  if (!principal.canWrite && !isReadMethod(req.method)) {
    throw new ForbiddenError('errors.apiTokenReadOnly');
  }

  req.userId = principal.userId;
  next();
}

/**
 * authMiddleware for a protocol that sends every request as a POST, whatever it does (MCP): the
 * method tells nothing about the scope a request needs, so a read-only API token is let through
 * and `req.canWrite` tells the route what the token may do. Same 401 as authMiddleware.
 */
export async function protocolAuthMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = await requirePrincipal(req);
  req.userId = principal.userId;
  req.canWrite = principal.canWrite;
  next();
}

/** The admin id set by authMiddleware, for a route mounted behind it. */
export function authenticatedUserId(req: AuthRequest): number {
  if (req.userId === undefined) throw new UnauthorizedError();
  return req.userId;
}

/**
 * Refuses with a 403 any request that carries an API token, valid or not: app.ts mounts it on
 * the routes reserved to the admin's session (SESSION_ONLY_ROUTES). It reads the header only,
 * so it runs before authMiddleware wherever that one is mounted.
 */
export function refuseApiTokens(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token && isApiToken(token)) throw new ForbiddenError('errors.apiTokenSessionOnly');
  next();
}

/**
 * Sets req.userId when a valid admin token or API token is sent, and never rejects the
 * request. Guests holding a stale token in localStorage must still see the public menu.
 */
export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);
  const principal = token ? await authenticate(token) : null;
  if (principal) {
    req.userId = principal.userId;
  }
  next();
}
