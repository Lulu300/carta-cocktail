import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
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

  it('should return 400 and keep the settings when siteName is not a string', async () => {
    const before = await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
    const res = await request.put('/api/settings').set(authHeader())
      .send({ siteName: 42 });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.siteName');
    const after = await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(after.siteName).toBe(before.siteName);
  });
});

describe('PUT /api/settings/profile', () => {
  const CURRENT_PASSWORD = 'testpass123';
  const NEW_PASSWORD = 'new-password-456';

  it('should update email with the current password', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ email: 'new@test.local', currentPassword: CURRENT_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, email: 'new@test.local' });
  });

  it('should refuse to change the email without the current password', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ email: 'new@test.local' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.currentPassword');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    expect(user.email).toBe('admin@test.local');
  });

  it('should refuse to change the email with a wrong current password', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .set('Accept-Language', 'en')
      .send({ email: 'new@test.local', currentPassword: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Current password is incorrect');
  });

  it('should return 400 with a translated message for an invalid email', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .set('Accept-Language', 'fr')
      .send({ email: 'not-an-email', currentPassword: CURRENT_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('L’adresse email n’est pas valide');
  });

  it('should return 400 if newPassword without currentPassword', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.currentPassword');
  });

  it('should return 400 with a translated message for an 11-character new password', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .set('Accept-Language', 'en')
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'x'.repeat(11) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The new password must be at least 12 characters long');
  });

  it('should return 400 with a translated message if currentPassword is wrong', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .set('Accept-Language', 'en')
      .send({ currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Current password is incorrect');
  });

  it('should return the wrong currentPassword message in French', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .set('Accept-Language', 'fr')
      .send({ currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Mot de passe actuel incorrect');
  });

  it('should update password with correct currentPassword', async () => {
    const res = await request.put('/api/settings/profile').set(authHeader())
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    // Verify new password works for login
    const loginRes = await request.post('/api/auth/login')
      .send({ email: 'admin@test.local', password: NEW_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });

  it('should hash the new password at the same bcrypt cost as the startup admin', async () => {
    await request.put('/api/settings/profile').set(authHeader())
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    expect(bcrypt.getRounds(user.passwordHash)).toBe(12);
  });

  it('should revoke the old token and return a new one when the password changes', async () => {
    const oldToken = authHeader();
    const res = await request.put('/api/settings/profile').set(oldToken)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, email: 'admin@test.local', token: expect.any(String) });

    expect((await request.get('/api/settings').set(oldToken)).status).toBe(401);
    const withNewToken = await request.get('/api/settings').set('Authorization', `Bearer ${res.body.token}`);
    expect(withNewToken.status).toBe(200);
  });

  it('should keep existing tokens when only the email changes', async () => {
    const token = authHeader();
    const res = await request.put('/api/settings/profile').set(token)
      .send({ email: 'new@test.local', currentPassword: CURRENT_PASSWORD });
    expect(res.body).not.toHaveProperty('token');
    expect((await request.get('/api/settings').set(token)).status).toBe(200);
  });
});
