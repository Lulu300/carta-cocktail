import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, authMiddleware, optionalAuth, signToken, verifyToken } from './auth';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, getAuthToken, prisma,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

// The admin seeded by seedRequiredData
const ADMIN_ID = 1;

function requestWith(authorization?: string): AuthRequest {
  return { headers: authorization ? { authorization } : {} } as AuthRequest;
}

function fakeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

/** An unsigned token, built by hand as an attacker would: jsonwebtoken refuses to verify it. */
function unsignedToken(payload: object): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

describe('signToken', () => {
  it('issues an HS256 token carrying the user id and token version', () => {
    const token = signToken({ id: ADMIN_ID, tokenVersion: 4 });
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload).toMatchObject({ userId: ADMIN_ID, tv: 4 });
  });

  it('sets a 7-day lifetime by default', () => {
    const decoded = jwt.decode(signToken({ id: ADMIN_ID, tokenVersion: 0 })) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 3600);
  });
});

describe('verifyToken', () => {
  it('returns the user id of a valid token', async () => {
    expect(await verifyToken(getAuthToken(ADMIN_ID))).toBe(ADMIN_ID);
  });

  it('accepts a token issued by signToken', async () => {
    expect(await verifyToken(signToken({ id: ADMIN_ID, tokenVersion: 0 }))).toBe(ADMIN_ID);
  });

  it('rejects a token signed with another secret', async () => {
    expect(await verifyToken(getAuthToken(ADMIN_ID, { secret: 'another-secret' }))).toBeNull();
  });

  it('rejects a token signed with another algorithm', async () => {
    expect(await verifyToken(getAuthToken(ADMIN_ID, { algorithm: 'HS512' }))).toBeNull();
  });

  it('rejects an unsigned token (alg: none)', async () => {
    expect(await verifyToken(getAuthToken(ADMIN_ID, { algorithm: 'none', secret: '' }))).toBeNull();
    expect(await verifyToken(unsignedToken({ userId: ADMIN_ID, tv: 0 }))).toBeNull();
  });

  it('rejects an expired token', async () => {
    expect(await verifyToken(getAuthToken(ADMIN_ID, { expiresInSeconds: -1 }))).toBeNull();
  });

  it('rejects a token without a numeric user id', async () => {
    expect(await verifyToken(jwt.sign({ sub: 'admin', tv: 0 }, process.env.JWT_SECRET!))).toBeNull();
  });

  it('rejects a token without a token version (issued before revocation existed)', async () => {
    expect(await verifyToken(jwt.sign({ userId: ADMIN_ID }, process.env.JWT_SECRET!))).toBeNull();
  });

  it('rejects a token whose version differs from the user', async () => {
    await prisma.user.update({ where: { id: ADMIN_ID }, data: { tokenVersion: 1 } });
    expect(await verifyToken(getAuthToken(ADMIN_ID, { tokenVersion: 0 }))).toBeNull();
    expect(await verifyToken(getAuthToken(ADMIN_ID, { tokenVersion: 1 }))).toBe(ADMIN_ID);
  });

  it('rejects a token of a deleted user', async () => {
    await prisma.user.delete({ where: { id: ADMIN_ID } });
    expect(await verifyToken(getAuthToken(ADMIN_ID))).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyToken('not-a-jwt')).toBeNull();
  });
});

describe('authMiddleware', () => {
  it('accepts a valid token and sets userId', async () => {
    const req = requestWith(`Bearer ${getAuthToken(ADMIN_ID)}`);
    const next = vi.fn();

    await authMiddleware(req, fakeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(ADMIN_ID);
  });

  it('returns 401 without an Authorization header', async () => {
    const res = fakeResponse();
    const next = vi.fn();

    await authMiddleware(requestWith(), res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a token signed with HS512', async () => {
    const req = requestWith(`Bearer ${getAuthToken(ADMIN_ID, { algorithm: 'HS512' })}`);
    const res = fakeResponse();
    const next = vi.fn();

    await authMiddleware(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });
});

describe('optionalAuth', () => {
  it('continues without a token and leaves userId unset', async () => {
    const req = requestWith();
    const res = fakeResponse();
    const next = vi.fn();

    await optionalAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('continues with an invalid token and leaves userId unset', async () => {
    const req = requestWith('Bearer x');
    const res = fakeResponse();
    const next = vi.fn();

    await optionalAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('continues with a revoked token and leaves userId unset', async () => {
    await prisma.user.update({ where: { id: ADMIN_ID }, data: { tokenVersion: 1 } });
    const req = requestWith(`Bearer ${getAuthToken(ADMIN_ID)}`);
    const next = vi.fn();

    await optionalAuth(req, fakeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
  });

  it('sets userId with a valid token', async () => {
    const req = requestWith(`Bearer ${getAuthToken(ADMIN_ID)}`);
    const next = vi.fn();

    await optionalAuth(req, fakeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(ADMIN_ID);
  });
});
