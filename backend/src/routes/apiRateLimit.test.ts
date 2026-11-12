import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, request, authHeader,
} from '../test/helpers';
import { resetRateLimits } from '../middleware/rateLimit';

// Read by config.ts when the app is imported: hoisted above the imports. Each
// test file has its own module registry, so the other files keep the default.
// Above the backup limit (10), so that the backup limit is reached first.
const API_LIMIT = vi.hoisted(() => {
  process.env.API_RATE_LIMIT = '15';
  return 15;
});
const BACKUP_LIMIT = 10;

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  await resetRateLimits();
});

// Container address of a reverse proxy (SWAG, Traefik…) in front of nginx
const OUTER_PROXY_IP = '172.18.0.5';

/**
 * Requests come from the loopback, like nginx on the host, and the app trusts
 * the proxies on private networks: the client is the last public address of
 * X-Forwarded-For.
 */
function getPublicSettings(forwardedFor: string) {
  return request.get('/api/public/settings').set('X-Forwarded-For', forwardedFor);
}

function getUnits(clientIp: string) {
  return request.get('/api/units').set('X-Forwarded-For', clientIp).set(authHeader());
}

/** Sends `count` requests one after the other and returns their statuses. */
async function statusesOf(count: number, send: () => PromiseLike<{ status: number }>): Promise<number[]> {
  const statuses: number[] = [];
  for (let sent = 0; sent < count; sent++) {
    statuses.push((await send()).status);
  }
  return statuses;
}

describe(`API rate limit (API_RATE_LIMIT=${API_LIMIT})`, () => {
  it('answers a translated 429 JSON with Retry-After on a public route', async () => {
    expect(await statusesOf(API_LIMIT, () => getPublicSettings('203.0.113.1'))).toEqual(Array(API_LIMIT).fill(200));

    const blocked = await getPublicSettings('203.0.113.1');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['content-type']).toMatch(/application\/json/);
    expect(blocked.body.error).toBe('Too many requests: try again in a few minutes');
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('answers the 429 in the client language', async () => {
    await statusesOf(API_LIMIT, () => getPublicSettings('203.0.113.2'));

    const blocked = await getPublicSettings('203.0.113.2').set('Accept-Language', 'fr');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Trop de requêtes : réessayez dans quelques minutes');
  });

  it('limits a protected route, counting the requests without a token too', async () => {
    const withoutToken = () => request.get('/api/units').set('X-Forwarded-For', '203.0.113.3');
    expect(await statusesOf(API_LIMIT, withoutToken)).toEqual(Array(API_LIMIT).fill(401));

    expect((await getUnits('203.0.113.3')).status).toBe(429);
  });

  it('refuses a request beyond the limit before reading its body', async () => {
    await statusesOf(API_LIMIT, () => getUnits('203.0.113.4'));

    const res = await request.post('/api/units')
      .set('X-Forwarded-For', '203.0.113.4')
      .set(authHeader())
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(429);
  });

  it('counts each client address separately', async () => {
    await statusesOf(API_LIMIT + 1, () => getUnits('203.0.113.5'));

    expect((await getUnits('203.0.113.6')).status).toBe(200);
  });

  it('counts each client separately behind two proxies (reverse proxy, then nginx)', async () => {
    const firstClient = () => getPublicSettings(`198.51.100.1, ${OUTER_PROXY_IP}`);
    await statusesOf(API_LIMIT, firstClient);
    expect((await firstClient()).status).toBe(429);

    expect((await getPublicSettings(`198.51.100.2, ${OUTER_PROXY_IP}`)).status).toBe(200);
  });

  it('never limits /api/health', async () => {
    const health = () => request.get('/api/health').set('X-Forwarded-For', '203.0.113.7');
    expect(await statusesOf(API_LIMIT + 5, health)).toEqual(Array(API_LIMIT + 5).fill(200));
  });
});

describe(`Backup rate limit (${BACKUP_LIMIT} authenticated requests per 15 minutes)`, () => {
  /** The cheapest backup request: no file, refused with 400 once authenticated. */
  function importWithoutFile(clientIp: string) {
    return request.post('/api/backup/import').set('X-Forwarded-For', clientIp).set(authHeader());
  }

  it('answers 429 beyond the backup limit, before the API limit', async () => {
    expect(await statusesOf(BACKUP_LIMIT, () => importWithoutFile('203.0.113.10')))
      .toEqual(Array(BACKUP_LIMIT).fill(400));

    const blocked = await importWithoutFile('203.0.113.10');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many requests: try again in a few minutes');
    expect(blocked.headers['retry-after']).toBeDefined();

    // The rest of the API still answers this client
    expect((await getUnits('203.0.113.10')).status).toBe(200);
  });

  it('does not count requests without a token, which only the API limit counts', async () => {
    const withoutToken = () => request.post('/api/backup/import').set('X-Forwarded-For', '203.0.113.11');
    expect(await statusesOf(BACKUP_LIMIT + 2, withoutToken)).toEqual(Array(BACKUP_LIMIT + 2).fill(401));

    // The admin behind the same address can still back up
    expect((await importWithoutFile('203.0.113.11')).status).toBe(400);
  });
});
