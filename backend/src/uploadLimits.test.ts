import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MAX_BACKUP_UPLOAD_BYTES } from './services/backupService';
import { MAX_IMAGE_BYTES } from './services/cocktail/cocktailImage';
import { MAX_BOTTLE_IMPORT_BYTES } from './utils/bottlesImport';

// nginx limits the whole request body before the backend sees it: a backend limit raised past
// the client_max_body_size of its location would give nginx's 413 for files the backend accepts.
const NGINX_TEMPLATE = path.resolve(__dirname, '../../frontend/nginx.conf.template');

const UPLOADS = [
  {
    name: 'cocktail photo',
    route: '/api/cocktails/1/image',
    field: 'image',
    maxBytes: MAX_IMAGE_BYTES,
  },
  {
    name: 'bottle import',
    route: '/api/bottles/import/preview',
    field: 'file',
    maxBytes: MAX_BOTTLE_IMPORT_BYTES,
  },
  {
    name: 'backup restore',
    route: '/api/backup/import',
    field: 'backup',
    maxBytes: MAX_BACKUP_UPLOAD_BYTES,
  },
];

// Longest name most file systems allow: the browser sends it in the multipart envelope
const LONGEST_FILE_NAME = `${'x'.repeat(251)}.zip`;

const SIZE_UNITS: Record<string, number> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

/** Bytes of an nginx size such as `20m`, `512k` or `1024`. */
function nginxSizeInBytes(size: string): number {
  const match = /^(\d+)([kmg]?)$/i.exec(size);
  if (!match) throw new Error(`Unexpected nginx size: ${size}`);
  return Number(match[1]) * SIZE_UNITS[match[2].toLowerCase()];
}

interface NginxLocation {
  exact: boolean;
  path: string;
  maxBodySize?: string;
}

/**
 * The server's client_max_body_size and its locations. Enough for this template, whose
 * locations are flat blocks: an exact (`=`) or prefix (none or `^~`) match, no regex.
 */
function readNginxLimits(config: string): {
  serverMaxBodySize: string;
  locations: NginxLocation[];
} {
  const locations: NginxLocation[] = [];
  const locationBlock = /^\s*location\s+(=|\^~)?\s*(\S+)\s*\{([^}]*)\}/gm;
  for (const [, modifier, locationPath, body] of config.matchAll(locationBlock)) {
    const maxBodySize = /client_max_body_size\s+(\S+);/.exec(body)?.[1];
    locations.push({ exact: modifier === '=', path: locationPath, maxBodySize });
  }
  const outsideLocations = config.replace(locationBlock, '');
  const serverMaxBodySize = /client_max_body_size\s+(\S+);/.exec(outsideLocations)?.[1];
  if (!serverMaxBodySize) throw new Error('No server-level client_max_body_size');
  return { serverMaxBodySize, locations };
}

/** nginx's limit for `route`: the exact location first, then the longest matching prefix. */
function nginxLimitFor(route: string, config: string): number {
  const { serverMaxBodySize, locations } = readNginxLimits(config);
  const exact = locations.find((location) => location.exact && location.path === route);
  const longestPrefix = locations
    .filter((location) => !location.exact && route.startsWith(location.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const location = exact ?? longestPrefix;
  return nginxSizeInBytes(location?.maxBodySize ?? serverMaxBodySize);
}

/** Size of the multipart envelope around one file: the body of the same form with an empty file. */
async function multipartEnvelopeBytes(field: string): Promise<number> {
  const form = new FormData();
  form.append(field, new Blob([], { type: 'application/octet-stream' }), LONGEST_FILE_NAME);
  const body = await new Request('http://localhost/', { method: 'POST', body: form }).arrayBuffer();
  return body.byteLength;
}

describe('upload limits and nginx', () => {
  const config = fs.readFileSync(NGINX_TEMPLATE, 'utf8');

  it('reads the limit of the location that nginx picks', () => {
    const sample = `server {
    client_max_body_size 1k;
    location = /api/backup/import {
        client_max_body_size 3m;
        proxy_pass $backend;
    }
    location /api/ {
        client_max_body_size 2k;
    }
    location ^~ /api/bottles/ {
        proxy_pass $backend;
    }
}`;

    expect(nginxLimitFor('/api/backup/import', sample)).toBe(3 * 1024 ** 2);
    expect(nginxLimitFor('/api/cocktails/1/image', sample)).toBe(2 * 1024);
    // The longest prefix wins, and without a limit of its own it takes the server's
    expect(nginxLimitFor('/api/bottles/import/preview', sample)).toBe(1024);
    expect(nginxLimitFor('/other', sample)).toBe(1024);
  });

  it.each(UPLOADS)(
    'lets a $name of exactly the backend limit through nginx',
    async ({ route, field, maxBytes }) => {
      const bodyBytes = maxBytes + (await multipartEnvelopeBytes(field));

      expect(bodyBytes).toBeLessThanOrEqual(nginxLimitFor(route, config));
    },
  );
});
