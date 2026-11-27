import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
  prisma,
  seedApiToken,
} from '../test/helpers';

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
});

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
    const res = await request.put('/api/settings').set(authHeader()).send({ siteName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.siteName).toBe('New Name');
  });

  it('should update site icon', async () => {
    const res = await request.put('/api/settings').set(authHeader()).send({ siteIcon: 'cocktail' });
    expect(res.status).toBe(200);
    expect(res.body.siteIcon).toBe('cocktail');
  });

  it('should only update provided fields', async () => {
    const res = await request.put('/api/settings').set(authHeader()).send({ siteName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.siteName).toBe('Updated');
    expect(res.body.siteIcon).toBe(''); // unchanged from seed
  });

  it('should return 400 and keep the settings when siteName is not a string', async () => {
    const before = await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
    const res = await request.put('/api/settings').set(authHeader()).send({ siteName: 42 });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.siteName');
    const after = await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(after.siteName).toBe(before.siteName);
  });
});

describe('Sites allowed to embed the public menu', () => {
  const putOrigins = (embedOrigins: unknown, language = 'en') =>
    request
      .put('/api/settings')
      .set(authHeader())
      .set('Accept-Language', language)
      .send({ embedOrigins });
  const storedOrigins = async () =>
    (await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } })).embedOrigins;

  it('lists none by default', async () => {
    const res = await request.get('/api/settings').set(authHeader());
    expect(res.body.embedOrigins).toEqual([]);
  });

  it('stores the normalized origins and sends them back as a list', async () => {
    const res = await putOrigins([
      'https://WWW.Mon-Bar.fr/',
      'https://www.mon-bar.fr',
      'http://localhost:8081',
    ]);
    expect(res.status).toBe(200);
    expect(res.body.embedOrigins).toEqual(['https://www.mon-bar.fr', 'http://localhost:8081']);
    expect(await storedOrigins()).toBe('https://www.mon-bar.fr http://localhost:8081');

    const read = await request.get('/api/settings').set(authHeader());
    expect(read.body.embedOrigins).toEqual(['https://www.mon-bar.fr', 'http://localhost:8081']);
  });

  it('keeps the origins when another setting is saved, and empties them on an empty list', async () => {
    await putOrigins(['https://www.mon-bar.fr']);
    await request.put('/api/settings').set(authHeader()).send({ siteName: 'Bar' });
    expect(await storedOrigins()).toBe('https://www.mon-bar.fr');

    const res = await putOrigins([]);
    expect(res.body.embedOrigins).toEqual([]);
    expect(await storedOrigins()).toBe('');
  });

  it.each([
    ['en', 'http://www.mon-bar.fr', 'uses http://'],
    ['fr', 'http://www.mon-bar.fr', 'utilise http://'],
    ['en', 'https://*.mon-bar.fr', 'wildcard'],
    ['fr', 'https://*.mon-bar.fr', 'joker'],
    ['en', 'https://www.mon-bar.fr/carte', 'not a site address'],
    ['fr', 'https://www.mon-bar.fr/carte', 'pas une adresse de site'],
  ])('refuses in %s %j, names it and keeps the stored list', async (language, origin, reason) => {
    await putOrigins(['https://ok.example']);
    const res = await putOrigins(['https://other.example', origin], language);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(reason);
    expect(res.body.error).toContain(origin);
    expect(await storedOrigins()).toBe('https://ok.example');
  });

  it('refuses a list that is not made of strings', async () => {
    const res = await putOrigins('https://www.mon-bar.fr');
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.embedOrigins');
  });
});

describe('PUT /api/settings/code-mode', () => {
  const storedCodeMode = async () =>
    (await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } })).codeModeEnabled;

  it('is off by default', async () => {
    const res = await request.get('/api/settings').set(authHeader());
    expect(res.body.codeModeEnabled).toBe(false);
  });

  it('turns Code Mode on and off, and answers the settings', async () => {
    const on = await request
      .put('/api/settings/code-mode')
      .set(authHeader())
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ siteName: 'Test Carta', codeModeEnabled: true });
    expect(await storedCodeMode()).toBe(true);

    // Saving the other settings leaves it alone
    await request.put('/api/settings').set(authHeader()).send({ siteName: 'Bar' }).expect(200);
    expect(await storedCodeMode()).toBe(true);

    const off = await request
      .put('/api/settings/code-mode')
      .set(authHeader())
      .send({ enabled: false });
    expect(off.body.codeModeEnabled).toBe(false);
    expect(await storedCodeMode()).toBe(false);
  });

  it('creates the settings row when it is missing', async () => {
    await prisma.siteSettings.deleteMany();

    const res = await request
      .put('/api/settings/code-mode')
      .set(authHeader())
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(await storedCodeMode()).toBe(true);
  });

  it('ignores a codeModeEnabled sent with the other settings', async () => {
    await request
      .put('/api/settings')
      .set(authHeader())
      .send({ codeModeEnabled: true })
      .expect(200);
    expect(await storedCodeMode()).toBe(false);
  });

  it('refuses a body without a boolean', async () => {
    const res = await request
      .put('/api/settings/code-mode')
      .set(authHeader())
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.enabled');
  });

  it('refuses a request without a session, and every API token', async () => {
    expect((await request.put('/api/settings/code-mode').send({ enabled: true })).status).toBe(401);
    for (const scope of ['READ_ONLY', 'READ_WRITE'] as const) {
      const { header } = await seedApiToken({ scope });
      const res = await request.put('/api/settings/code-mode').set(header).send({ enabled: true });
      expect(res.status).toBe(403);
    }
    expect(await storedCodeMode()).toBe(false);
  });
});

describe('PUT /api/settings/profile', () => {
  const CURRENT_PASSWORD = 'testpass123';
  const NEW_PASSWORD = 'new-password-456';

  it('should update email with the current password', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ email: 'new@test.local', currentPassword: CURRENT_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, email: 'new@test.local' });
  });

  it('should refuse to change the email without the current password', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ email: 'new@test.local' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.currentPassword');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    expect(user.email).toBe('admin@test.local');
  });

  it('should refuse to change the email with a wrong current password', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .set('Accept-Language', 'en')
      .send({ email: 'new@test.local', currentPassword: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Current password is incorrect');
  });

  it('should return 400 with a translated message for an invalid email', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .set('Accept-Language', 'fr')
      .send({ email: 'not-an-email', currentPassword: CURRENT_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('L’adresse email n’est pas valide');
  });

  it('should return 400 if newPassword without currentPassword', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.currentPassword');
  });

  it('should return 400 with a translated message for an 11-character new password', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .set('Accept-Language', 'en')
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'x'.repeat(11) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The new password must be at least 12 characters long');
  });

  it('should return 400 with a translated message if currentPassword is wrong', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .set('Accept-Language', 'en')
      .send({ currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Current password is incorrect');
  });

  it('should return the wrong currentPassword message in French', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .set('Accept-Language', 'fr')
      .send({ currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Mot de passe actuel incorrect');
  });

  it('should update password with correct currentPassword', async () => {
    const res = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    // Verify new password works for login
    const loginRes = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: NEW_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });

  it('should hash the new password at the same bcrypt cost as the startup admin', async () => {
    await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    expect(bcrypt.getRounds(user.passwordHash)).toBe(12);
  });

  it('should revoke the old token and return a new one when the password changes', async () => {
    const oldToken = authHeader();
    const res = await request
      .put('/api/settings/profile')
      .set(oldToken)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, email: 'admin@test.local', token: expect.any(String) });

    expect((await request.get('/api/settings').set(oldToken)).status).toBe(401);
    const withNewToken = await request
      .get('/api/settings')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(withNewToken.status).toBe(200);
  });

  it('should keep existing tokens when only the email changes', async () => {
    const token = authHeader();
    const res = await request
      .put('/api/settings/profile')
      .set(token)
      .send({ email: 'new@test.local', currentPassword: CURRENT_PASSWORD });
    expect(res.body).not.toHaveProperty('token');
    expect((await request.get('/api/settings').set(token)).status).toBe(200);
  });
});
