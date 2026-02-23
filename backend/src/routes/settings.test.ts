import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/settings', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('should return site settings', async () => {
    const res = await request.get('/api/settings').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('siteName');
    expect(res.body.siteName).toBe('Test Carta');
  });
});

describe('PUT /api/settings', () => {
  it('should update site name', async () => {
    const res = await request.put('/api/settings').set(authHeader())
      .send({ siteName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.siteName).toBe('New Name');
  });

  it('should update site icon', async () => {
    const res = await request.put('/api/settings').set(authHeader())
      .send({ siteIcon: 'cocktail' });
    expect(res.status).toBe(200);
    expect(res.body.siteIcon).toBe('cocktail');
  });

  it('should only update provided fields', async () => {
    const res = await request.put('/api/settings').set(authHeader())
      .send({ siteName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.siteName).toBe('Updated');
    expect(res.body.siteIcon).toBe(''); // unchanged from seed
  });
});

describe('PUT /api/settings/profile', () => {
  it('should update email', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ email: 'new@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('new@test.local');
  });

  it('should return 400 if newPassword without currentPassword', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ newPassword: 'newpass123' });
    expect(res.status).toBe(400);
  });

  it('should return 401 if currentPassword is wrong', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  it('should update password with correct currentPassword', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ currentPassword: 'testpass123', newPassword: 'newpass456' });
    expect(res.status).toBe(200);

    // Verify new password works for login
    const loginRes = await request.post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'newpass456' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });
});
