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

// Container address of a reverse proxy (SWAG, Traefik…) in front of nginx
const OUTER_PROXY_IP = '172.18.0.5';

/**
 * Logs in with the given X-Forwarded-For. Requests come from the loopback, like
 * nginx on the host, and the app trusts the proxies on private networks: the
 * client is the last public address of the header. Each test uses its own
 * client addresses and starts with empty counters.
 */
function loginWithForwardedFor(forwardedFor: string, password: string) {
  return request.post('/api/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ email: 'admin@test.local', password });
}

/** Logs in from a client that only nginx stands in front of. */
function loginFrom(clientIp: string, password: string) {
  return loginWithForwardedFor(clientIp, password);
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

  it('counts each client separately behind two proxies (reverse proxy, then nginx)', async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await loginWithForwardedFor(`198.51.100.1, ${OUTER_PROXY_IP}`, 'wrong');
    }
    expect((await loginWithForwardedFor(`198.51.100.1, ${OUTER_PROXY_IP}`, 'wrong')).status).toBe(429);

    const otherClient = await loginWithForwardedFor(`198.51.100.2, ${OUTER_PROXY_IP}`, GOOD_PASSWORD);
    expect(otherClient.status).toBe(200);
  });

  it('ignores an address forged in X-Forwarded-For by a client on the internet', async () => {
    // The client writes any address it likes in front of its real one: the
    // trusted proxies only vouch for the real one, which keeps its counter.
    for (let attempt = 0; attempt < 3; attempt++) {
      const forged = `192.0.2.${attempt}, 198.51.100.7, ${OUTER_PROXY_IP}`;
      expect((await loginWithForwardedFor(forged, 'wrong')).status).toBe(401);
    }
    const res = await loginWithForwardedFor(`192.0.2.99, 198.51.100.7, ${OUTER_PROXY_IP}`, 'wrong');
    expect(res.status).toBe(429);
  });
});
