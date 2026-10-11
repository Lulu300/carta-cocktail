import dotenv from 'dotenv';
import express from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Resolves the folder where uploaded images are stored.
 *
 * The default is relative to this file and assumes the repository layout
 * (`<repo>/backend/{src,dist}`), so it gives `<repo>/uploads`. In the Docker
 * image the backend sits directly in `/app`, where the default would be
 * `/uploads`, outside the volume: that is why the image sets UPLOAD_DIR.
 */
export function resolveUploadDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UPLOAD_DIR) {
    return path.resolve(env.UPLOAD_DIR);
  }
  // Dev default: <repo>/uploads
  return path.resolve(__dirname, '../../uploads');
}

const MIN_JWT_SECRET_LENGTH = 32;

// Values published in this public repository (old defaults, docs, test setup):
// anyone could forge admin tokens with them.
const WEAK_SECRETS = ['default-secret', 'change-me-to-a-random-secret', 'your-random-secret', 'test-secret'];

/**
 * Returns the JWT secret, or throws when it is missing or guessable.
 * The check is skipped only for the test suite, which uses a fixed secret.
 */
export function assertJwtSecret(secret: string | undefined, nodeEnv: string | undefined): string {
  if (nodeEnv === 'test') {
    return secret ?? '';
  }
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH || WEAK_SECRETS.includes(secret)) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)');
  }
  return secret;
}

const DEFAULT_LOGIN_RATE_LIMIT = 10;
const DEFAULT_JWT_EXPIRES_IN = '7d';

export type JwtExpiresIn = NonNullable<SignOptions['expiresIn']>;

/** Failed logins allowed per IP address in 15 minutes (LOGIN_RATE_LIMIT). */
export function parseLoginRateLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_LOGIN_RATE_LIMIT;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`LOGIN_RATE_LIMIT must be a positive integer, got '${value}'`);
  }
  return limit;
}

/**
 * Token lifetime (JWT_EXPIRES_IN), as jsonwebtoken reads it: a number of seconds
 * or a timespan such as "7d" or "24h". A value jsonwebtoken cannot read fails at
 * startup rather than at the first login.
 */
export function parseJwtExpiresIn(value: string | undefined): JwtExpiresIn {
  if (!value) {
    return DEFAULT_JWT_EXPIRES_IN;
  }
  const expiresIn = /^\d+$/.test(value) ? Number(value) : (value as JwtExpiresIn);
  try {
    jwt.sign({}, 'lifetime-check', { expiresIn });
  } catch {
    throw new Error(`JWT_EXPIRES_IN must be a number of seconds or a timespan such as 7d or 24h, got '${value}'`);
  }
  return expiresIn;
}

// Proxies on the host or a private network: nginx alone, or a reverse proxy
// such as SWAG in front of it. A client on the internet cannot pass for one.
const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

/**
 * Express `trust proxy` setting (TRUST_PROXY): a number of proxy hops, or a
 * comma-separated list of addresses, subnets or names (`loopback`, `uniquelocal`…).
 * An address Express cannot read fails at startup.
 */
export function parseTrustProxy(value: string | undefined): number | string {
  if (!value) {
    return DEFAULT_TRUST_PROXY;
  }
  const trustProxy = /^\d+$/.test(value) ? Number(value) : value;
  try {
    // Express compiles the setting when it is set, and throws on a bad address
    express().set('trust proxy', trustProxy);
  } catch {
    throw new Error(`TRUST_PROXY must be a number of proxies or a list of addresses or subnets, got '${value}'`);
  }
  return trustProxy;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: assertJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV),
  jwtExpiresIn: parseJwtExpiresIn(process.env.JWT_EXPIRES_IN),
  loginRateLimit: parseLoginRateLimit(process.env.LOGIN_RATE_LIMIT),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Empty: no cross-origin access. The SPA calls the API on its own origin,
  // through nginx in production and the Vite proxy in development.
  corsOrigin: process.env.CORS_ORIGIN || '',
  uploadDir: resolveUploadDir(),
};
