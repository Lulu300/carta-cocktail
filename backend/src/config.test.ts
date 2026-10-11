import { describe, it, expect } from 'vitest';
import path from 'path';
import jwt from 'jsonwebtoken';
import {
  assertJwtSecret, parseJwtExpiresIn, parseLoginRateLimit, parseTrustProxy, resolveUploadDir,
} from './config';

describe('resolveUploadDir', () => {
  it('should use UPLOAD_DIR when it is an absolute path', () => {
    expect(resolveUploadDir({ UPLOAD_DIR: '/tmp/x' })).toBe(path.resolve('/tmp/x'));
  });

  it('should resolve a relative UPLOAD_DIR to an absolute path', () => {
    const dir = resolveUploadDir({ UPLOAD_DIR: 'rel/dir' });
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir).toBe(path.resolve('rel/dir'));
  });

  it('should default to the repository uploads folder when UPLOAD_DIR is not set', () => {
    const dir = resolveUploadDir({});
    expect(dir).toBe(path.resolve(__dirname, '../../uploads'));
    expect(dir).not.toContain(`${path.sep}dist${path.sep}`);
  });

  it('should fall back to the default when UPLOAD_DIR is empty', () => {
    expect(resolveUploadDir({ UPLOAD_DIR: '' })).toBe(resolveUploadDir({}));
  });
});

describe('assertJwtSecret', () => {
  const strongSecret = '0123456789abcdef'.repeat(4);
  const rejectedSecrets: Array<[string, string | undefined]> = [
    ['undefined', undefined],
    ['an empty string', ''],
    ['a 31-character string', 'x'.repeat(31)],
    ['the old compose default', 'change-me-to-a-random-secret'],
    ['the old config default', 'default-secret'],
  ];

  describe.each(['production', undefined])('with NODE_ENV=%s', (nodeEnv) => {
    it.each(rejectedSecrets)('should reject %s', (_label, secret) => {
      expect(() => assertJwtSecret(secret, nodeEnv)).toThrow(
        'JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)',
      );
    });

    it('should accept a 64-character hex secret', () => {
      expect(assertJwtSecret(strongSecret, nodeEnv)).toBe(strongSecret);
    });
  });

  it.each(rejectedSecrets)('should not reject %s when NODE_ENV is test', (_label, secret) => {
    expect(() => assertJwtSecret(secret, 'test')).not.toThrow();
  });
});

describe('parseLoginRateLimit', () => {
  it.each([undefined, ''])('should default to 10 failed attempts for %j', (value) => {
    expect(parseLoginRateLimit(value)).toBe(10);
  });

  it('should read a positive integer', () => {
    expect(parseLoginRateLimit('3')).toBe(3);
  });

  it.each(['0', '-1', '2.5', 'ten'])('should reject %s', (value) => {
    expect(() => parseLoginRateLimit(value)).toThrow(`LOGIN_RATE_LIMIT must be a positive integer, got '${value}'`);
  });
});

describe('parseJwtExpiresIn', () => {
  it.each([undefined, ''])('should keep the 7-day lifetime for %j', (value) => {
    expect(parseJwtExpiresIn(value)).toBe('7d');
  });

  it('should read a timespan', () => {
    expect(parseJwtExpiresIn('24h')).toBe('24h');
  });

  it('should read a number of seconds', () => {
    const expiresIn = parseJwtExpiresIn('3600');
    expect(expiresIn).toBe(3600);
    const decoded = jwt.decode(jwt.sign({}, 'secret', { expiresIn })) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(3600);
  });

  it('should reject a value jsonwebtoken cannot read', () => {
    expect(() => parseJwtExpiresIn('one week')).toThrow(
      "JWT_EXPIRES_IN must be a number of seconds or a timespan such as 7d or 24h, got 'one week'",
    );
  });
});

describe('parseTrustProxy', () => {
  it.each([undefined, ''])('should trust the proxies on private networks for %j', (value) => {
    expect(parseTrustProxy(value)).toBe('loopback, linklocal, uniquelocal');
  });

  it('should read a number of proxy hops', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('should read a list of addresses and subnets', () => {
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });

  it.each(['true', 'not-an-address'])('should reject %s', (value) => {
    expect(() => parseTrustProxy(value)).toThrow(
      `TRUST_PROXY must be a number of proxies or a list of addresses or subnets, got '${value}'`,
    );
  });
});
