import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, request,
} from '../test/helpers';

// Read by config.ts when the app is imported: hoisted above the imports. Each
// test file has its own module registry, so the other files keep the default.
vi.hoisted(() => {
  process.env.LOGIN_RATE_LIMIT = '3';
});

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

const GOOD_PASSWORD = 'testpass123';

/**
 * Logs in from the given client address. The app trusts one proxy, so the
 * address comes from X-Forwarded-For, as nginx sends it: each test uses its
 * own address and starts with an empty counter.
 */
function loginFrom(clientIp: string, password: string) {
  return request.post('/api/auth/login')
    .set('X-Forwarded-For', clientIp)
    .send({ email: 'admin@test.local', password });
}

describe('Login rate limit (LOGIN_RATE_LIMIT=3)', () => {
  it('answers a translated 429 JSON after 3 failed attempts', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await loginFrom('203.0.113.1', 'wrong')).status).toBe(401);
    }

    const blocked = await loginFrom('203.0.113.1', 'wrong').set('Accept-Language', 'fr');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['content-type']).toMatch(/application\/json/);
    expect(blocked.body.error).toBe('Trop de tentatives de connexion échouées : réessayez dans quelques minutes');
    expect(blocked.headers['retry-after']).toBeDefined();

    // Even the right password waits for the window to end
    expect((await loginFrom('203.0.113.1', GOOD_PASSWORD)).status).toBe(429);
  });

  it('does not count a successful login', async () => {
    expect((await loginFrom('203.0.113.2', 'wrong')).status).toBe(401);
    expect((await loginFrom('203.0.113.2', 'wrong')).status).toBe(401);
    expect((await loginFrom('203.0.113.2', GOOD_PASSWORD)).status).toBe(200);
    // Third failure: still answered, since the success did not use up an attempt
    expect((await loginFrom('203.0.113.2', 'wrong')).status).toBe(401);
    expect((await loginFrom('203.0.113.2', 'wrong')).status).toBe(429);
  });

  it('counts each client address separately', async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await loginFrom('203.0.113.3', 'wrong');
    }
    expect((await loginFrom('203.0.113.4', GOOD_PASSWORD)).status).toBe(200);
  });
});
