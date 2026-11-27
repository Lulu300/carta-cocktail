import { createHash, randomBytes } from 'crypto';
import type { z } from 'zod';
import type { ApiToken as ApiTokenRow } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../errors';
import type { ApiTokenCreate } from '../validation/apiTokens';

/**
 * API tokens of scripts and MCP clients (F-16). A token is `carta_` followed by 32 random
 * bytes in base64url. With 256 bits of entropy, a SHA-256 hash is enough to store it: a slow
 * hash such as bcrypt only protects secrets that can be guessed, and would slow every request.
 */
export const API_TOKEN_PREFIX = 'carta_';
const API_TOKEN_SECRET_BYTES = 32;
const VISIBLE_SUFFIX_LENGTH = 4;

/** Tokens that have not expired yet, per admin. */
export const MAX_ACTIVE_API_TOKENS = 20;

// lastUsedAt is written at most once a minute per token: a write on every request would
// queue each request of a script behind the others on SQLite's single connection.
const LAST_USE_RESOLUTION_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** The fields the API sends: never the hash. */
const API_TOKEN_FIELDS = {
  id: true,
  name: true,
  scope: true,
  lastFour: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
} as const;

/** Who a request authenticates as. `canWrite` is false for a read-only API token only. */
export interface Principal {
  userId: number;
  canWrite: boolean;
}

/** Tells an API token from a session JWT, which never starts with this prefix. */
export function isApiToken(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateApiToken(): string {
  return API_TOKEN_PREFIX + randomBytes(API_TOKEN_SECRET_BYTES).toString('base64url');
}

export function listApiTokens(userId: number) {
  return prisma.apiToken.findMany({
    where: { userId },
    select: API_TOKEN_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Creates a token and returns it with its secret, which is never readable again. Refused with
 * a 409 when the admin already has MAX_ACTIVE_API_TOKENS tokens that have not expired.
 */
export async function createApiToken(
  userId: number,
  { name, scope, expiresInDays }: z.output<typeof ApiTokenCreate>,
  now: Date = new Date(),
) {
  const token = generateApiToken();
  // In one transaction, so that two creations at once cannot both pass the count
  const created = await prisma.$transaction(async (tx) => {
    const activeTokens = await tx.apiToken.count({ where: { userId, expiresAt: { gt: now } } });
    if (activeTokens >= MAX_ACTIVE_API_TOKENS) {
      throw new ConflictError('errors.apiTokenLimit', { max: MAX_ACTIVE_API_TOKENS });
    }
    return tx.apiToken.create({
      data: {
        userId,
        name,
        scope,
        tokenHash: hashApiToken(token),
        lastFour: token.slice(-VISIBLE_SUFFIX_LENGTH),
        expiresAt: new Date(now.getTime() + expiresInDays * DAY_MS),
      },
      select: API_TOKEN_FIELDS,
    });
  });
  return { ...created, token };
}

/** Revokes one token of the admin: its row is deleted, so the token is unknown from now on. */
export async function revokeApiToken(userId: number, id: number): Promise<void> {
  const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError();
}

/**
 * Records when a token was last used, at most once a minute. A failed write (database busy
 * or read-only) must not fail a request the token is allowed to make.
 */
async function recordUse(row: ApiTokenRow, now: Date): Promise<void> {
  if (row.lastUsedAt && now.getTime() - row.lastUsedAt.getTime() < LAST_USE_RESOLUTION_MS) return;
  try {
    await prisma.apiToken.updateMany({ where: { id: row.id }, data: { lastUsedAt: now } });
  } catch (err) {
    console.warn('Could not record the last use of an API token:', err);
  }
}

/** Returns who the token authenticates, or null when it is unknown (or revoked) or expired. */
export async function verifyApiToken(
  token: string,
  now: Date = new Date(),
): Promise<Principal | null> {
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } });
  if (!row || row.expiresAt <= now) return null;
  await recordUse(row, now);
  // Any other stored value reads only: the least the token can do
  return { userId: row.userId, canWrite: row.scope === 'READ_WRITE' };
}
