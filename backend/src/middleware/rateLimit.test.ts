import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createRateLimiter } from './rateLimit';
import { errorHandler } from './errorHandler';

const LIMIT = 2;

/**
 * A fresh app with one limiter, so that each test starts with empty counters.
 * Requests come from the loopback, which the app trusts like nginx: the client
 * is the address written in X-Forwarded-For.
 */
function limitedApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(createRateLimiter({ windowMs: 60_000, limit: LIMIT, messageKey: 'errors.tooManyRequests' }));
  app.get('/', (_req, res) => { res.sendStatus(204); });
  app.use(errorHandler);
  const request = supertest(app);
  return (clientIp: string) => request.get('/').set('X-Forwarded-For', clientIp);
}

/** Sends one request from each address, in order, and returns their statuses. */
async function statusesFrom(send: ReturnType<typeof limitedApp>, clientIps: string[]): Promise<number[]> {
  const statuses: number[] = [];
  for (const clientIp of clientIps) {
    statuses.push((await send(clientIp)).status);
  }
  return statuses;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('createRateLimiter', () => {
  it('counts the addresses of one IPv6 /64 together, as one LAN', async () => {
    const send = limitedApp();
    // Temporary addresses of devices on the same Wi-Fi
    const sameLan = ['2001:db8:1:2::a', '2001:db8:1:2:bbbb::b', '2001:db8:1:2:ffff:ffff:ffff:ffff'];

    expect(await statusesFrom(send, sameLan)).toEqual([204, 204, 429]);
  });

  it('counts each IPv6 /64 separately, within one /56 too', async () => {
    const send = limitedApp();
    await statusesFrom(send, ['2001:db8:1:2::1', '2001:db8:1:2::1', '2001:db8:1:2::1']);

    // Another LAN of the same site (guest VLAN, staff VLAN) keeps its own count
    expect(await statusesFrom(send, ['2001:db8:1:3::1', '2001:db8:1:ff::1'])).toEqual([204, 204]);
  });

  it('counts an IPv4 client per address, in its IPv4-mapped IPv6 form too', async () => {
    const send = limitedApp();

    expect(await statusesFrom(send, ['203.0.113.1', '::ffff:203.0.113.1', '203.0.113.1'])).toEqual([204, 204, 429]);
    expect((await send('203.0.113.2')).status).toBe(204);
  });

  it('raises no express-rate-limit validation error or warning', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The library checks its options on creation and the request on the first call
    await statusesFrom(limitedApp(), ['2001:db8:1:2::1', '203.0.113.1']);

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
