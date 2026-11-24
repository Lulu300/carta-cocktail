import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import supertest from 'supertest';
import i18next, { i18nMiddleware } from '.';
import { errorHandler } from '../middleware/errorHandler';
import { BadRequestError } from '../errors';

// French separates thousands with a narrow no-break space
const ENGLISH_MESSAGE = 'The file has more than 5,000 rows: split it into several imports';
const FRENCH_MESSAGE = 'Le fichier a plus de 5 000 lignes : répartissez-le en plusieurs imports';

/** The i18n middleware and the error handler of app.ts around a message with a formatted number. */
function languageApp() {
  const app = express();
  app.use(i18nMiddleware);
  app.get('/', () => {
    throw new BadRequestError('errors.import.tooManyRows', { max: 5000 });
  });
  app.use(errorHandler);
  return app;
}

/**
 * What i18next keeps per language on the instance every request shares. A language added to
 * one of these stays there for every later request, until the process restarts.
 */
function sharedLanguageState() {
  const { languageUtils, pluralResolver } = i18next.services;
  return {
    preload: [...(i18next.options.preload || [])],
    storedLanguages: Object.keys(i18next.store.data),
    resolvedHierarchies: Object.keys(languageUtils.resolveHierarchyCache),
    formattedCodes: [...languageUtils.formattedCodes.keys()],
    pluralRules: Object.keys(pluralResolver.pluralRulesCache),
  };
}

/** A distinct code of three letters for each `index`: none of them is a language of the app. */
function madeUpLanguage(index: number): string {
  const letter = (position: number) => String.fromCharCode(97 + (Math.floor(index / 26 ** position) % 26));
  return letter(2) + letter(1) + letter(0);
}

let server: http.Server;
let request: ReturnType<typeof supertest>;

// One server for every request: the made-up languages test sends thousands of them
beforeAll(async () => {
  server = http.createServer(languageApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  request = supertest(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('request language', () => {
  it.each([
    ['nothing', {}, '', 'en', ENGLISH_MESSAGE],
    ['?lng=fr', {}, '?lng=fr', 'fr', FRENCH_MESSAGE],
    ['?lng=FR', {}, '?lng=FR', 'fr', FRENCH_MESSAGE],
    ['?lng=fr_FR', {}, '?lng=fr_FR', 'fr', FRENCH_MESSAGE],
    ['Accept-Language: fr', { 'Accept-Language': 'fr' }, '', 'fr', FRENCH_MESSAGE],
    ['Accept-Language: fr-FR', { 'Accept-Language': 'fr-FR,fr;q=0.9' }, '', 'fr', FRENCH_MESSAGE],
    ['Accept-Language: en', { 'Accept-Language': 'en' }, '', 'en', ENGLISH_MESSAGE],
    ['Accept-Language: en-US', { 'Accept-Language': 'en-US' }, '', 'en', ENGLISH_MESSAGE],
    ['Accept-Language: en-GB', { 'Accept-Language': 'en-GB' }, '', 'en-GB', ENGLISH_MESSAGE],
    ['Accept-Language: en-gb', { 'Accept-Language': 'en-gb' }, '', 'en-GB', ENGLISH_MESSAGE],
    ['the cookie', { Cookie: 'i18next=fr' }, '', 'fr', FRENCH_MESSAGE],
  ])('serves %s in its language', async (_source, headers, query, language, message) => {
    const res = await request.get(`/${query}`).set(headers);

    expect(res.headers['content-language']).toBe(language);
    expect(res.body.error).toBe(message);
  });

  it.each([
    ['fr-CA, en;q=0.5', 'fr', FRENCH_MESSAGE],
    ['en-US, fr;q=0.8', 'en', ENGLISH_MESSAGE],
  ])('serves the first acceptable language of Accept-Language: %s', async (header, language, message) => {
    const res = await request.get('/').set('Accept-Language', header);

    expect(res.headers['content-language']).toBe(language);
    expect(res.body.error).toBe(message);
  });

  it.each([
    ['de', 'en', ENGLISH_MESSAGE],
    ['de-DE, fr;q=0.5', 'fr', FRENCH_MESSAGE],
  ])('skips a language the app does not have in Accept-Language: %s', async (header, language, message) => {
    const res = await request.get('/').set('Accept-Language', header);

    // English numbers too: `de` used to get English text with `5.000`
    expect(res.headers['content-language']).toBe(language);
    expect(res.body.error).toBe(message);
  });

  it('moves on to Accept-Language when ?lng= names a language the app does not have', async () => {
    const res = await request.get('/?lng=de').set('Accept-Language', 'fr');

    expect(res.headers['content-language']).toBe('fr');
    expect(res.body.error).toBe(FRENCH_MESSAGE);
  });

  it('never answers the keys of the messages (?lng=cimode)', async () => {
    const res = await request.get('/?lng=cimode');

    expect(res.headers['content-language']).toBe('en');
    expect(res.body.error).toBe(ENGLISH_MESSAGE);
  });

  it('keeps no state for made-up languages, however many requests bring them', async () => {
    // Every language of the app once, so that the state below holds all it ever needs
    for (const language of ['en', 'en-GB', 'fr']) await request.get(`/?lng=${language}`);
    const stateBefore = sharedLanguageState();
    expect(stateBefore.preload).toEqual(['en', 'fr']);
    expect(stateBefore.resolvedHierarchies.length).toBeGreaterThan(0);
    expect(stateBefore.formattedCodes.length).toBeGreaterThan(0);

    // 2,000 requests, each with a different made-up language in the query, the cookie and the header
    for (let index = 0; index < 2000; index++) {
      const res = await request.get(`/?lng=xx${index}`)
        .set('Cookie', `i18next=yy${index}`)
        .set('Accept-Language', `${madeUpLanguage(index)}-ZZ`);
      expect(res.headers['content-language']).toBe('en');
      expect(res.body.error).toBe(ENGLISH_MESSAGE);
    }

    expect(sharedLanguageState()).toEqual(stateBefore);
  });
});
