import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader,
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

  it('should return 401 for non-existent email', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'nobody@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('should return 401 for wrong password', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('should return 200 with token and user for valid credentials', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'admin@test.local' });
  });

  it('should return a valid JWT token', async () => {
    const res = await request.post('/api/auth/login').send({ email: 'admin@test.local', password: 'testpass123' });
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3); // JWT format
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
