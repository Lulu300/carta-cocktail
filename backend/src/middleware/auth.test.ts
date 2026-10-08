import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, authMiddleware, optionalAuth, verifyToken } from './auth';
import { getAuthToken } from '../test/helpers';

function requestWith(authorization?: string): AuthRequest {
  return { headers: authorization ? { authorization } : {} } as AuthRequest;
}

function fakeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('verifyToken', () => {
  it('returns the user id of a valid HS256 token', () => {
    expect(verifyToken(getAuthToken(7))).toEqual({ userId: 7 });
  });

  it('rejects a token signed with another secret', () => {
    expect(verifyToken(getAuthToken(1, { secret: 'another-secret' }))).toBeNull();
  });

  it('rejects a token signed with another algorithm', () => {
    expect(verifyToken(getAuthToken(1, { algorithm: 'HS512' }))).toBeNull();
  });

  it('rejects an unsigned token (alg: none)', () => {
    expect(verifyToken(getAuthToken(1, { algorithm: 'none', secret: '' }))).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verifyToken(getAuthToken(1, { expiresInSeconds: -60 }))).toBeNull();
  });

  it('rejects a token without a numeric user id', () => {
    expect(verifyToken(jwt.sign({ sub: 'admin' }, process.env.JWT_SECRET!))).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-jwt')).toBeNull();
  });
});

describe('authMiddleware', () => {
  it('accepts a valid token and sets userId', () => {
    const req = requestWith(`Bearer ${getAuthToken(3)}`);
    const res = fakeResponse();
    const next = vi.fn();

    authMiddleware(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(3);
  });

  it('returns 401 without an Authorization header', () => {
    const res = fakeResponse();
    const next = vi.fn();

    authMiddleware(requestWith(), res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a token signed with HS512', () => {
    const req = requestWith(`Bearer ${getAuthToken(1, { algorithm: 'HS512' })}`);
    const res = fakeResponse();
    const next = vi.fn();

    authMiddleware(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });
});

describe('optionalAuth', () => {
  it('continues without a token and leaves userId unset', () => {
    const req = requestWith();
    const res = fakeResponse();
    const next = vi.fn();

    optionalAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('continues with an invalid token and leaves userId unset', () => {
    const req = requestWith('Bearer x');
    const res = fakeResponse();
    const next = vi.fn();

    optionalAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets userId with a valid token', () => {
    const req = requestWith(`Bearer ${getAuthToken(5)}`);
    const next = vi.fn();

    optionalAuth(req, fakeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(5);
  });
});
