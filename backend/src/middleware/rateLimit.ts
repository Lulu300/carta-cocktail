import type { RequestHandler } from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';
import { HttpError } from '../errors';

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  /** i18n key of the 429 answer, e.g. `errors.tooManyRequests`. */
  messageKey: string;
  skipSuccessfulRequests?: boolean;
}

// One store per limiter: express-rate-limit refuses to share a store, and the
// tests need to reach every store to reset the counters.
const stores: MemoryStore[] = [];

// An IPv6 client counts for its /64, the network of one LAN, like the devices
// behind one IPv4 address. Per address, a client would get around the limits by
// picking new addresses in its /64; the library's /56 would make a guest VLAN
// share the staff VLAN's count, or unrelated mobile subscribers share one.
const IPV6_SUBNET = 64;

/**
 * Limits requests per client address (req.ip, which follows TRUST_PROXY), and
 * per /64 network for IPv6. Counters live in memory: a restart resets them,
 * enough for a single instance.
 */
export function createRateLimiter({
  windowMs, limit, messageKey, skipSuccessfulRequests = false,
}: RateLimiterOptions): RequestHandler {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    store,
    ipv6Subnet: IPV6_SUBNET,
    // RateLimit and Retry-After headers only, without the older X-RateLimit-* ones
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Through errorHandler, so that the 429 is translated JSON like any other error
    handler: (_req, _res, next) => next(new HttpError(429, messageKey)),
  });
}

/** Empties the counters of every limiter, so that each test starts with none. */
export async function resetRateLimits(): Promise<void> {
  await Promise.all(stores.map((store) => store.resetAll()));
}
