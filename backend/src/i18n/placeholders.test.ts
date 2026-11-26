import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AdmZip from 'adm-zip';
import type { Response } from 'supertest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, seedCategory, seedUnit,
} from '../test/helpers';
import { messageAt, placeholders, type Messages } from '../test/messages';
import { MAX_ZIP_ENTRY_BYTES } from '../utils/bottlesImport';
import { MAX_IMPORT_BOTTLES, MAX_IMPORT_ROWS } from '../validation/bottleImport';
import en from './en.json';
import fr from './fr.json';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

type Language = 'en' | 'fr';

const previewBottles = (file: Buffer, filename: string, language: Language) =>
  request.post('/api/bottles/import/preview').set(authHeader()).set('Accept-Language', language)
    .attach('file', file, filename);

const csvOfRows = (rows: string[]) => Buffer.from(['name,categoryName,capacityMl', ...rows].join('\n'));

/** Each case makes the real code throw the error of one message that has placeholders. */
const CASES: Record<string, (language: Language) => Promise<Response>> = {
  'errors.import.malformedHeader': (language) => {
    const zip = new AdmZip();
    zip.addFile('bottles.csv', Buffer.from('name,capacityMl\nHavana,700'));
    zip.addFile('categories.csv', Buffer.from('"name,type\nRhum,SPIRIT'));
    return previewBottles(zip.toBuffer(), 'bottles.zip', language);
  },
  'errors.import.zipEntryTooLarge': (language) => {
    // Uniform filling compresses to a few KB, under the limit of the upload
    const zip = new AdmZip();
    zip.addFile('bottles.csv', Buffer.alloc(MAX_ZIP_ENTRY_BYTES + 1, ' '));
    return previewBottles(zip.toBuffer(), 'bottles.zip', language);
  },
  'errors.import.tooManyRows': (language) => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Bottle ${i},Rhum,700`);
    return previewBottles(csvOfRows(rows), 'bottles.csv', language);
  },
  'errors.import.tooManyBottles': (language) => {
    // A row stands for up to 50 identical bottles: enough rows to go over the total
    const rowCount = Math.ceil(MAX_IMPORT_BOTTLES / 50) + 1;
    const rows = Array.from({ length: rowCount }, (_, i) => `Bottle ${i},Rhum,700,50`);
    return previewBottles(Buffer.from(['name,categoryName,capacityMl,quantity', ...rows].join('\n')), 'bottles.csv', language);
  },
  'errors.ambiguousCategoryName': async (language) => {
    await seedCategory({ name: 'Rum' });
    await seedCategory({ name: 'RUM' });
    return request.post('/api/bottles/import/confirm').set(authHeader()).set('Accept-Language', language).send({
      payload: { version: 1, bottles: [], categories: [] },
      resolutions: { categories: { rum: { action: 'create', data: { name: 'rum' } } } },
    });
  },
  'errors.ambiguousUnitAbbreviation': async (language) => {
    await seedUnit({ name: 'Upper', abbreviation: 'CL' });
    await seedUnit({ name: 'Mixed', abbreviation: 'Cl' });
    const unit = { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 };
    const recipe = {
      version: 1,
      cocktail: {
        name: 'Imported',
        ingredients: [{ sourceType: 'INGREDIENT', sourceName: 'Lime', quantity: 1, unit }],
        instructions: [{ text: 'Shake' }],
      },
    };
    return request.post('/api/cocktails/import/confirm').set(authHeader()).set('Accept-Language', language).send({
      recipe,
      resolutions: { units: { cl: { action: 'create', data: unit } } },
    });
  },
};

/** Every key of a message tree that holds a message with a placeholder. */
function keysWithPlaceholders(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([name, value]) => {
    const key = prefix + name;
    if (typeof value === 'string') return placeholders(value).length > 0 ? [key] : [];
    return keysWithPlaceholders(value, `${key}.`);
  });
}

describe('messages with placeholders', () => {
  it('has a case for every message with a placeholder', () => {
    expect(Object.keys(CASES).sort()).toEqual(keysWithPlaceholders(en).sort());
  });

  describe.each(Object.entries(CASES))('%s', (key, raise) => {
    it.each([['en', en], ['fr', fr]] as [Language, Messages][])(
      'receives a value for each placeholder, in %s',
      async (language, messages) => {
        const res = await raise(language);

        expect(res.status).toBeGreaterThanOrEqual(400);
        // The details are the values the error carries for the placeholders
        const given = Object.keys(res.body.details ?? {});
        expect(given).toEqual(expect.arrayContaining(placeholders(messageAt(messages, key)!)));
        // An absent value is rendered "NaN" with a number format, and left as is without one
        expect(res.body.error).not.toMatch(/NaN|{{/);
      },
    );
  });
});
