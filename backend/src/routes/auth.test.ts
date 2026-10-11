import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, getAuthToken, prisma,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('POST /api/auth/login', () => {
  it('should return 400 if email is missing', async () => {
    const res = await request.post('/api/auth/login').send({ password: 'testpass123' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if password is missing', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local' });
    expect(res.status).toBe(400);
  });

  it('should return 400 with details when email is not a string', async () => {
    const res = await request.post('/api/auth/login').send({ email: {}, password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.email', code: 'invalid_type' });
  });

  it('should return 401 for non-existent email, after a bcrypt comparison', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const res = await request.post('/api/auth/login').send({ email: 'nobody@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    // Same work as for a wrong password, so the response time does not reveal unknown emails
    expect(compare).toHaveBeenCalledOnce();
    expect(compare.mock.calls[0][0]).toBe('wrong');
    compare.mockRestore();
  });

  it('should return 401 for wrong password', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('should return 200 with token and user for valid credentials', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'admin@test.local' });
  });

  it('should return an HS256 token carrying the user token version', async () => {
    await prisma.user.update({ where: { id: 1 }, data: { tokenVersion: 3 } });
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'testpass123' });
    const decoded = jwt.decode(res.body.token, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload).toMatchObject({ userId: 1, tv: 3 });

    const me = await request.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('should return 401 without auth token', async () => {
    const res = await request.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('should return user data with valid token', async () => {
    const res = await request.get('/api/auth/me').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, email: 'admin@test.local' });
  });
});

describe('Rejected tokens on a protected route', () => {
  const secret = process.env.JWT_SECRET!;
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');

  it.each([
    ['signed with another secret', () => getAuthToken(1, { secret: 'another-secret' })],
    ['expired', () => getAuthToken(1, { expiresInSeconds: -1 })],
    ['forged with alg: none', () => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ userId: 1, tv: 0 })}.`],
    ['without a token version', () => jwt.sign({ userId: 1 }, secret)],
    ['of another token version', () => getAuthToken(1, { tokenVersion: 1 })],
  ])('answers 401 for a token %s', async (_label, buildToken) => {
    const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${buildToken()}`);
    expect(res.status).toBe(401);
  });

  it('answers 401 for a token of a deleted user', async () => {
    const token = getAuthToken(1);
    await prisma.user.delete({ where: { id: 1 } });
    const res = await request.get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('should return 401 without auth token', async () => {
    const res = await request.post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });

  it('should revoke every existing token', async () => {
    const otherDevice = authHeader();
    const res = await request.post('/api/auth/logout-all').set(authHeader())
      .set('Accept-Language', 'fr');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Déconnecté de tous les appareils');

    expect((await request.get('/api/auth/me').set(otherDevice)).status).toBe(401);

    const login = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'testpass123' });
    const me = await request.get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
  });
});
