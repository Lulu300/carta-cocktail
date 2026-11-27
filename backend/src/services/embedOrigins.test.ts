import { describe, it, expect } from 'vitest';
import { HttpError } from '../errors';
import {
  checkEmbedOrigin,
  MAX_EMBED_ORIGINS,
  parseEmbedOrigins,
  serializeEmbedOrigins,
} from './embedOrigins';

describe('checkEmbedOrigin', () => {
  it.each([
    ['https://www.mon-bar.fr', 'https://www.mon-bar.fr'],
    ['  https://www.mon-bar.fr/  ', 'https://www.mon-bar.fr'],
    ['HTTPS://WWW.Mon-Bar.FR', 'https://www.mon-bar.fr'],
    ['https://bar.example:8443', 'https://bar.example:8443'],
    ['https://bar.example:443', 'https://bar.example'],
    ['https://café.example', 'https://xn--caf-dma.example'],
    ['http://localhost:8081', 'http://localhost:8081'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
  ])('accepts %j as %j', (input, origin) => {
    expect(checkEmbedOrigin(input)).toEqual({ origin });
  });

  it.each([
    ['*', 'wildcard'],
    ['https://*.mon-bar.fr', 'wildcard'],
    ['https://*', 'wildcard'],
    ['http://www.mon-bar.fr', 'insecure'],
    ['http://192.168.1.10', 'insecure'],
    ['www.mon-bar.fr', 'notAnOrigin'],
    ['', 'notAnOrigin'],
    ['https://www.mon-bar.fr/carte', 'notAnOrigin'],
    ['https://www.mon-bar.fr/?menu=1', 'notAnOrigin'],
    ['https://www.mon-bar.fr/#carte', 'notAnOrigin'],
    ['https://user:secret@www.mon-bar.fr', 'notAnOrigin'],
    ["https://bar.example';", 'notAnOrigin'],
    ['https://bar.example;script-src', 'notAnOrigin'],
    ['https://a.example,https://b.example', 'notAnOrigin'],
    ['https://[::1]', 'notAnOrigin'],
    ['ftp://bar.example', 'notAnOrigin'],
    ["'self'", 'notAnOrigin'],
  ])('refuses %j (%s)', (input, error) => {
    expect(checkEmbedOrigin(input)).toEqual({ error });
  });
});

describe('serializeEmbedOrigins', () => {
  it('stores the normalized origins once each, separated by a space', () => {
    expect(
      serializeEmbedOrigins([
        'https://www.mon-bar.fr/',
        'https://WWW.MON-BAR.FR',
        'https://b.example',
      ]),
    ).toBe('https://www.mon-bar.fr https://b.example');
  });

  it('stores an empty list as an empty string', () => {
    expect(serializeEmbedOrigins([])).toBe('');
  });

  it('refuses the first invalid origin with its reason and the origin as typed', () => {
    let error: unknown;
    try {
      serializeEmbedOrigins(['https://ok.example', ' http://bar.example ', '*']);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 400,
      i18nKey: 'errors.embedOrigin.insecure',
      details: { origin: 'http://bar.example' },
    });
  });

  it('refuses more origins than the limit', () => {
    const origins = Array.from(
      { length: MAX_EMBED_ORIGINS + 1 },
      (_, index) => `https://site${index}.example`,
    );
    expect(() => serializeEmbedOrigins(origins)).toThrow(
      expect.objectContaining({ i18nKey: 'errors.embedOrigin.tooMany' }),
    );
    expect(serializeEmbedOrigins(origins.slice(1)).split(' ')).toHaveLength(MAX_EMBED_ORIGINS);
  });
});

describe('parseEmbedOrigins', () => {
  it('reads an empty value as no site', () => {
    expect(parseEmbedOrigins('')).toEqual([]);
  });

  it('reads the stored list', () => {
    expect(parseEmbedOrigins('https://a.example https://b.example')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  // A restored backup brings back the column as it was in the archive
  it('drops what a hand-edited database could hold and the CSP must never receive', () => {
    expect(
      parseEmbedOrigins(
        "https://a.example * 'unsafe-inline'; http://b.example https://c.example/x",
      ),
    ).toEqual(['https://a.example']);
  });
});
