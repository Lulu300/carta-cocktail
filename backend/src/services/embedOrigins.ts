/**
 * Sites allowed to show the public menu in an iframe (SiteSettings.embedOrigins). nginx copies
 * the list into the `frame-ancestors` directive of the CSP of /menu/ pages
 * (frontend/nginx.conf.template), so every origin must be a valid CSP host source: anything
 * else could break the header or open the menu to more sites than the admin listed.
 */
import { BadRequestError } from '../errors';

/** Read by nginx as $upstream_http_x_embed_origins (frontend/nginx.conf.template). */
export const EMBED_ORIGINS_HEADER = 'X-Embed-Origins';

/** Keeps the header of /menu/ pages short; a bar embeds its menu on a few sites at most. */
export const MAX_EMBED_ORIGINS = 20;

/** The only hosts allowed over plain http: a site in development on the admin's machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * What a CSP host source accepts once the URL parser has lowercased the host and converted an
 * international name to punycode: labels of letters, digits and hyphens. The URL parser lets
 * through characters such as `'`, `;` or `,`, which would end the directive or the header.
 * IPv6 addresses are left out: CSP host sources have no syntax for them.
 */
const CSP_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export type EmbedOriginError = 'notAnOrigin' | 'wildcard' | 'insecure';

export type EmbedOriginCheck = { origin: string } | { error: EmbedOriginError };

/**
 * The origin to store for what the admin typed: `https://host[:port]`, without path, query,
 * fragment or credentials, the host lowercased and the default port dropped
 * ("https://WWW.Bar.fr:443/" gives "https://www.bar.fr"). A wildcard is refused, and so is
 * plain http except on localhost and 127.0.0.1: an embedding page served over http could be replaced on
 * its way to the guest.
 */
export function checkEmbedOrigin(input: string): EmbedOriginCheck {
  const value = input.trim();
  if (value.includes('*')) return { error: 'wildcard' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'notAnOrigin' };
  }
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return { error: 'insecure' };

  const isWebUrl = url.protocol === 'https:' || url.protocol === 'http:';
  const hasOnlyOrigin =
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  if (!isWebUrl || !hasOnlyOrigin || !CSP_HOST.test(url.hostname)) return { error: 'notAnOrigin' };
  return { origin: url.origin };
}

/**
 * The list typed by the admin, ready to store: each origin checked and normalized, duplicates
 * dropped. The first refused origin answers 400, its message naming it and saying why.
 */
export function serializeEmbedOrigins(inputs: readonly string[]): string {
  const origins = new Set<string>();
  for (const input of inputs) {
    const check = checkEmbedOrigin(input);
    if ('error' in check) {
      throw new BadRequestError(`errors.embedOrigin.${check.error}`, { origin: input.trim() });
    }
    origins.add(check.origin);
  }
  if (origins.size > MAX_EMBED_ORIGINS) {
    throw new BadRequestError('errors.embedOrigin.tooMany', { max: MAX_EMBED_ORIGINS });
  }
  return [...origins].join(' ');
}

/**
 * The stored origins that are still valid. The route only stores checked origins, but a backup
 * restore brings back the database as it was: checking again keeps a hand-edited value out of
 * the CSP header.
 */
export function parseEmbedOrigins(stored: string): string[] {
  return stored
    .split(' ')
    .filter((origin) => {
      const check = checkEmbedOrigin(origin);
      return 'origin' in check && check.origin === origin;
    })
    .slice(0, MAX_EMBED_ORIGINS);
}
