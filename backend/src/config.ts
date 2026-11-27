import dotenv from 'dotenv';
import express from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import path from 'path';

// Quiet: dotenv logs each load by default, and the Docker image has no .env to report.
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

/**
 * Resolves the folder where uploaded images are stored.
 *
 * The default is relative to this file and assumes the repository layout
 * (`<repo>/backend/{src,dist}`), so it gives `<repo>/uploads`. In the Docker
 * image the backend sits directly in `/app`, where the default would be
 * `/uploads`, outside the volume: that is why the image sets UPLOAD_DIR.
 */
export function resolveUploadDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveRepositoryFolder(env.UPLOAD_DIR, 'uploads');
}

/**
 * Resolves the folder of the release notes read by the in-app upgrade guide.
 * Same rule as UPLOAD_DIR: `<repo>/docs/releases` by default, and the Docker
 * image, which holds the notes in `/app/releases`, sets RELEASES_DIR.
 */
export function resolveReleasesDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveRepositoryFolder(env.RELEASES_DIR, 'docs/releases');
}

/** The folder a variable names, or `<repo>/<devDefault>`, found from this file and not from the cwd. */
function resolveRepositoryFolder(value: string | undefined, devDefault: string): string {
  if (value) {
    return path.resolve(value);
  }
  return path.resolve(__dirname, '../..', devDefault);
}

/**
 * Version of the running backend: the tag version in a released image
 * (`1.12.0`, `1.12.0-rc.1`), `dev` in any other build. Read at each call, as
 * the tests change it. `||`, not `??`: an APP_VERSION set but empty is `dev` too.
 */
export function appVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_VERSION || 'dev';
}

const MIN_JWT_SECRET_LENGTH = 32;

// Values published in this public repository (old defaults, docs, test setup):
// anyone could forge admin tokens with them.
const WEAK_SECRETS = [
  'default-secret',
  'change-me-to-a-random-secret',
  'your-random-secret',
  'test-secret',
];

/**
 * Returns the JWT secret, or throws when it is missing or guessable.
 * The check is skipped only for the test suite, which uses a fixed secret.
 */
export function assertJwtSecret(secret: string | undefined, nodeEnv: string | undefined): string {
  if (nodeEnv === 'test') {
    return secret ?? '';
  }
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH || WEAK_SECRETS.includes(secret)) {
    throw new Error(
      'JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)',
    );
  }
  return secret;
}

const POSITIVE_INTEGER_DEFAULTS = {
  // Failed logins allowed per IP address (per /64 network for IPv6) in 15 minutes
  LOGIN_RATE_LIMIT: 10,
  // API requests allowed per IP address (per /64 network for IPv6) in one minute.
  // Guests in a bar often share one public address or /64: the limit must stay well above what a full room sends.
  API_RATE_LIMIT: 600,
};

export type PositiveIntegerVariable = keyof typeof POSITIVE_INTEGER_DEFAULTS;

/** Reads a positive integer variable, or its default when it is not set. */
export function parsePositiveInteger(
  name: PositiveIntegerVariable,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = env[name];
  if (!value) {
    return POSITIVE_INTEGER_DEFAULTS[name];
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got '${value}'`);
  }
  return parsed;
}

const DEFAULT_JWT_EXPIRES_IN = '7d';

export type JwtExpiresIn = NonNullable<SignOptions['expiresIn']>;

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
    throw new Error(
      `JWT_EXPIRES_IN must be a number of seconds or a timespan such as 7d or 24h, got '${value}'`,
    );
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
    throw new Error(
      `TRUST_PROXY must be a number of proxies or a list of addresses or subnets, got '${value}'`,
    );
  }
  return trustProxy;
}

/**
 * Public address of the site (PUBLIC_BASE_URL), such as `https://carte.example.com`, without a
 * trailing slash; null when it is not set. Link previews need absolute URLs, and behind a TLS
 * reverse proxy the backend only sees `http` from nginx. Any other scheme fails at startup.
 */
export function parsePublicBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const url = URL.parse(value);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(
      `PUBLIC_BASE_URL must be an http or https address such as https://carte.example.com, got '${value}'`,
    );
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: assertJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV),
  jwtExpiresIn: parseJwtExpiresIn(process.env.JWT_EXPIRES_IN),
  loginRateLimit: parsePositiveInteger('LOGIN_RATE_LIMIT'),
  apiRateLimit: parsePositiveInteger('API_RATE_LIMIT'),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Empty: no cross-origin access. The SPA calls the API on its own origin,
  // through nginx in production and the Vite proxy in development.
  corsOrigin: process.env.CORS_ORIGIN || '',
  publicBaseUrl: parsePublicBaseUrl(process.env.PUBLIC_BASE_URL),
  uploadDir: resolveUploadDir(),
  releasesDir: resolveReleasesDir(),
};
