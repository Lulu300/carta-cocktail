import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import type { Request } from 'express';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
  prisma,
  seedApiToken,
  seedMenu,
} from '../test/helpers';
import { authenticatedUserId } from '../middleware/auth';
import { MAX_ACTIVE_API_TOKENS } from '../services/apiTokenService';

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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DAY_MS = 24 * 60 * 60_000;

function createToken(body: Record<string, unknown>) {
  return request.post('/api/api-tokens').set(authHeader()).send(body);
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/api-tokens', () => {
  it('should create a read-only token for 90 days by default, and send it once', async () => {
    const before = Date.now();
    const res = await createToken({ name: '  Home Assistant  ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Home Assistant', scope: 'READ_ONLY' });
    expect(res.body.token).toMatch(/^carta_[A-Za-z0-9_-]{43}$/);
    expect(res.body.lastFour).toBe(res.body.token.slice(-4));
    const lifetime = Date.parse(res.body.expiresAt) - before;
    expect(lifetime).toBeGreaterThanOrEqual(90 * DAY_MS);
    expect(lifetime).toBeLessThan(90 * DAY_MS + 60_000);

    const list = await request.get('/api/api-tokens').set(authHeader());
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('token');
    expect(list.body[0]).not.toHaveProperty('tokenHash');
  });

  it('should store only the SHA-256 hash of the token', async () => {
    const { token } = (await createToken({ name: 'MCP', scope: 'READ_WRITE' })).body;

    const row = await prisma.apiToken.findFirstOrThrow();

    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(Object.values(row).map(String)).not.toContain(token);
  });

  it.each([
    [{ name: '' }, 'body.name'],
    [{ name: 'x'.repeat(101) }, 'body.name'],
    [{ name: 'MCP', scope: 'ADMIN' }, 'body.scope'],
    [{ name: 'MCP', expiresInDays: 45 }, 'body.expiresInDays'],
    [{ name: 'MCP', expiresInDays: null }, 'body.expiresInDays'],
  ])('should refuse %o with a 400 on %s', async (body, path) => {
    const res = await createToken(body);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe(path);
  });

  it(`should refuse a token beyond ${MAX_ACTIVE_API_TOKENS} active ones, expired ones left out`, async () => {
    await seedApiToken({
      name: 'Expired',
      expiresInDays: 30,
      createdAt: new Date(Date.now() - 31 * DAY_MS),
    });
    for (let index = 0; index < MAX_ACTIVE_API_TOKENS; index++) await seedApiToken();

    const res = await createToken({ name: 'One too many' }).set('Accept-Language', 'fr');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(
      "Vous avez déjà 20 jetons d'API actifs : révoquez-en un avant d'en créer un autre",
    );
  });
});

describe('API token authentication', () => {
  it('should let a read-only token read, and refuse its writes with a 403', async () => {
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });

    const read = await request.get('/api/units').set(header);
    const head = await request.head('/api/units').set(header);
    const write = await request
      .post('/api/units')
      .set(header)
      .send({ name: 'Shot', abbreviation: 'shot' });
    const remove = await request.delete('/api/units/1').set(header);

    expect([read.status, head.status, write.status, remove.status]).toEqual([200, 200, 403, 403]);
    expect(write.body.error).toBe(
      'This API token is read-only: create a read and write token to change data',
    );
    expect(await prisma.unit.count()).toBe(0);
  });

  it('should let a read and write token write', async () => {
    const { header } = await seedApiToken({ scope: 'READ_WRITE' });

    const res = await request
      .post('/api/units')
      .set(header)
      .send({ name: 'Shot', abbreviation: 'shot' });

    expect(res.status).toBe(201);
  });

  it('should refuse a revoked token with a 401', async () => {
    const { id, header } = await seedApiToken();

    const revoke = await request.delete(`/api/api-tokens/${id}`).set(authHeader());
    const res = await request.get('/api/units').set(header);

    expect(revoke.status).toBe(200);
    expect(revoke.body.message).toBe('API token revoked');
    expect(res.status).toBe(401);
    expect(await prisma.apiToken.count()).toBe(0);
  });

  it('should answer 404 when revoking a token that does not exist', async () => {
    const res = await request.delete('/api/api-tokens/999').set(authHeader());

    expect(res.status).toBe(404);
  });

  it('should refuse an expired token with a 401, and keep it in the list', async () => {
    const { header } = await seedApiToken({
      expiresInDays: 30,
      createdAt: new Date(Date.now() - 30 * DAY_MS - 1000),
    });

    const res = await request.get('/api/units').set(header);
    const list = await request.get('/api/api-tokens').set(authHeader());

    expect(res.status).toBe(401);
    expect(list.body).toHaveLength(1);
  });

  it('should refuse an unknown token with a 401', async () => {
    const res = await request.get('/api/units').set(bearer(`carta_${'A'.repeat(43)}`));

    expect(res.status).toBe(401);
  });

  it('should answer GET /api/auth/me for the admin the token belongs to', async () => {
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });

    const res = await request.get('/api/auth/me').set(header);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, email: 'admin@test.local' });
  });

  it('should show a private menu to a token on the public routes, as to the admin', async () => {
    const menu = await seedMenu({ isPublic: false });
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });

    const withToken = await request.get(`/api/public/menus/${menu.slug}`).set(header);
    const withRevokedToken = await request
      .get(`/api/public/menus/${menu.slug}`)
      .set(bearer(`carta_${'B'.repeat(43)}`));

    expect([withToken.status, withRevokedToken.status]).toEqual([200, 404]);
  });

  it('should record the last use at most once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-11-27T10:00:00Z');
    vi.setSystemTime(start);
    const { id, header } = await seedApiToken();
    const lastUsedAt = async () =>
      (await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt;
    expect(await lastUsedAt()).toBeNull();

    await request.get('/api/units').set(header);
    expect(await lastUsedAt()).toEqual(start);

    vi.setSystemTime(new Date(start.getTime() + 59_000));
    await request.get('/api/units').set(header);
    expect(await lastUsedAt()).toEqual(start);

    const later = new Date(start.getTime() + 60_000);
    vi.setSystemTime(later);
    await request.get('/api/units').set(header);
    expect(await lastUsedAt()).toEqual(later);
  });

  it('should answer the request when the last use cannot be recorded', async () => {
    const { header } = await seedApiToken();
    vi.spyOn(prisma.apiToken, 'updateMany').mockRejectedValueOnce(new Error('SQLITE_READONLY'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request.get('/api/units').set(header);

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      'Could not record the last use of an API token:',
      expect.any(Error),
    );
  });
});

describe('routes reserved to the session', () => {
  it.each([
    ['GET', '/api/api-tokens'],
    ['POST', '/api/api-tokens'],
    ['DELETE', '/api/api-tokens/1'],
    ['PUT', '/api/settings/profile'],
    ['POST', '/api/auth/logout-all'],
    ['GET', '/api/backup/export'],
    ['POST', '/api/backup/import'],
    ['GET', '/API/Backup/export/'],
  ])('should refuse %s %s to a read and write token with a 403', async (method, url) => {
    const { header } = await seedApiToken({ scope: 'READ_WRITE' });

    const res =
      await request[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](url).set(header);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      'API tokens cannot use this route: sign in to the admin panel instead',
    );
    // Nothing happened: the token is still there and the session still valid
    expect(await prisma.apiToken.count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 1 } })).tokenVersion).toBe(0);
  });

  it('should still let the session reach them', async () => {
    const res = await request.get('/api/api-tokens').set(authHeader());

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('should revoke every API token too', async () => {
    const readOnly = await seedApiToken({ scope: 'READ_ONLY' });
    const readWrite = await seedApiToken({ scope: 'READ_WRITE' });

    const res = await request.post('/api/auth/logout-all').set(authHeader());

    expect(res.status).toBe(200);
    expect(await prisma.apiToken.count()).toBe(0);
    for (const { header } of [readOnly, readWrite]) {
      expect((await request.get('/api/units').set(header)).status).toBe(401);
    }
  });
});

describe('authenticatedUserId', () => {
  it('should refuse a request that authMiddleware did not authenticate', () => {
    expect(() => authenticatedUserId({} as Request)).toThrow('errors.unauthorized');
  });
});
