import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  ImportParseError,
  MAX_ZIP_ENTRY_BYTES,
  parseCsvBottles,
  parseImportFile,
  parseJsonBottles,
  parseZipBottles,
  stripBom,
} from './bottlesImport';
import { MAX_IMPORT_ROWS } from '../validation/bottleImport';

const BOM = '\uFEFF';
const HEADER = 'name,categoryName,categoryType,capacityMl,quantity,remainingPercent,alcoholPercentage,purchasePrice,location,openedAt,isApero,isDigestif';

function csvOf(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function jsonBottle(fields: Record<string, unknown> = {}) {
  return { name: 'Havana', categoryName: 'Rhum', capacityMl: 700, ...fields };
}

function parseError(parse: () => unknown): ImportParseError {
  try {
    parse();
  } catch (err) {
    if (err instanceof ImportParseError) return err;
    throw err;
  }
  throw new Error('expected an ImportParseError');
}

describe('stripBom', () => {
  it('removes a leading byte order mark only', () => {
    expect(stripBom(`${BOM}name`)).toBe('name');
    expect(stripBom('name')).toBe('name');
  });
});

describe('parseCsvBottles', () => {
  it('reads a CSV saved by Excel: BOM, semicolons and decimal commas', () => {
    const csv = `${BOM}name;categoryName;capacityMl;alcoholPercentage;purchasePrice;isApero\r\n`
      + 'Havana 7;Rhum;700;40,5;25,90;VRAI\r\n';

    const payload = parseCsvBottles(csv, 'en');

    expect(payload.errors).toEqual([]);
    expect(payload.bottles).toEqual([expect.objectContaining({
      name: 'Havana 7', capacityMl: 700, alcoholPercentage: 40.5, purchasePrice: 25.9, isApero: true,
    })]);
  });

  it('keeps a semicolon inside a quoted field', () => {
    const payload = parseCsvBottles('name;capacityMl;location\n"Gin; London Dry";700;"Bar; top shelf"', 'en');
    expect(payload.bottles[0]).toMatchObject({ name: 'Gin; London Dry', location: 'Bar; top shelf' });
  });

  it('keeps the comma separator when the header has more commas than semicolons', () => {
    const payload = parseCsvBottles('name,capacityMl,location\nGin,700,Bar; top shelf', 'en');
    expect(payload.bottles[0]).toMatchObject({ name: 'Gin', location: 'Bar; top shelf' });
  });

  it('removes the apostrophe the export puts before a formula', () => {
    const payload = parseCsvBottles(csvOf("'=1+1,Rhum,SPIRIT,700,1,100,,,'@cellar,,false,false"), 'en');
    expect(payload.bottles[0]).toMatchObject({ name: '=1+1', location: '@cellar' });
  });

  it('derives the categories of the kept rows, with their type', () => {
    const payload = parseCsvBottles(csvOf(
      'Havana,Rhum,SPIRIT,700,1,,,,,,,',
      'Monin,Sirop,SYRUP,700,1,,,,,,,',
      'Bad,Ignored,SPIRIT,,1,,,,,,,',
    ), 'en');
    expect(payload.categories.map((c) => [c.name, c.type])).toEqual([['Rhum', 'SPIRIT'], ['Sirop', 'SYRUP']]);
  });

  it('skips the rows a spreadsheet leaves with empty cells only', () => {
    const payload = parseCsvBottles(csvOf('Havana,Rhum,SPIRIT,700,1,,,,,,,', ',,,,,,,,,,,', ' , ,'), 'en');
    expect(payload.bottles).toHaveLength(1);
    expect(payload.errors).toEqual([]);
  });

  it('caps the quantity between 1 and 50', () => {
    const payload = parseCsvBottles(csvOf('A,Rhum,,700,0,,,,,,,', 'B,Rhum,,700,80,,,,,,,', 'C,Rhum,,700,2.7,,,,,,,'), 'en');
    expect(payload.bottles.map((b) => b.quantity)).toEqual([1, 50, 2]);
  });

  it.each([
    ['name', ',Rhum,SPIRIT,700,1,,,,,,,', 'required'],
    ['capacityMl', 'Havana,Rhum,SPIRIT,,1,,,,,,,', 'required'],
    ['capacityMl', 'Havana,Rhum,SPIRIT,0,1,,,,,,,', 'outOfRange'],
    ['capacityMl', 'Havana,Rhum,SPIRIT,70cl,1,,,,,,,', 'invalidNumber'],
    ['capacityMl', 'Havana,Rhum,SPIRIT,700.5,1,,,,,,,', 'invalidNumber'],
    ['quantity', 'Havana,Rhum,SPIRIT,700,many,,,,,,,', 'invalidNumber'],
    ['remainingPercent', 'Havana,Rhum,SPIRIT,700,1,150,,,,,,', 'outOfRange'],
    ['remainingPercent', 'Havana,Rhum,SPIRIT,700,1,-1,,,,,,', 'outOfRange'],
    ['alcoholPercentage', 'Havana,Rhum,SPIRIT,700,1,,101,,,,,', 'outOfRange'],
    ['purchasePrice', 'Havana,Rhum,SPIRIT,700,1,,,-3,,,,', 'outOfRange'],
    ['openedAt', 'Havana,Rhum,SPIRIT,700,1,,,,,abc,,', 'invalidDate'],
  ])('leaves out a row whose %s is invalid (%s)', (field, row, code) => {
    const payload = parseCsvBottles(csvOf('Valid,Rhum,SPIRIT,700,1,,,,,,,', row), 'en');

    expect(payload.bottles.map((b) => b.name)).toEqual(['Valid']);
    expect(payload.errors).toEqual([{ source: 'bottles', line: 3, field, code }]);
  });

  it('keeps a Windows line break inside a quoted field', () => {
    const payload = parseCsvBottles('name,capacityMl,location\r\nGin,700,"Shelf\r\nleft"\r\nRum,700,\r\n', 'en');
    expect(payload.bottles.map((b) => b.location)).toEqual(['Shelf\r\nleft', null]);
  });

  it('reports the file line of a row after a multi-line quoted field', () => {
    const payload = parseCsvBottles(csvOf('"Two\nlines",Rhum,,700,1,,,,,,,', '', 'Bad,Rhum,,,1,,,,,,,'), 'en');
    expect(payload.errors).toEqual([{ source: 'bottles', line: 5, field: 'capacityMl', code: 'required' }]);
  });

  it('refuses a file without a capacityMl column', () => {
    expect(parseError(() => parseCsvBottles('name\nHavana', 'en'))).toMatchObject({
      code: 'missingColumn', params: { column: 'capacityMl' },
    });
  });

  it('reads an empty file as an empty import', () => {
    expect(parseCsvBottles(BOM, 'en')).toEqual({ version: 1, categories: [], bottles: [], errors: [] });
  });

  it(`accepts ${MAX_IMPORT_ROWS} rows and refuses one more`, () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `Bottle ${i},Rhum,,700,1,,,,,,,`);
    expect(parseCsvBottles(csvOf(...rows), 'en').bottles).toHaveLength(MAX_IMPORT_ROWS);

    const error = parseError(() => parseCsvBottles(csvOf(...rows, 'One more,Rhum,,700,1,,,,,,,'), 'en'));
    expect(error).toMatchObject({ code: 'tooManyRows', params: { max: MAX_IMPORT_ROWS } });
  });

  it('refuses rows that would create more than 2,000 bottles', () => {
    const rows = Array.from({ length: 41 }, (_, i) => `Bottle ${i},Rhum,,700,50,,,,,,,`);
    expect(parseError(() => parseCsvBottles(csvOf(...rows), 'en')).code).toBe('tooManyBottles');
  });
});

describe('opening dates', () => {
  const datedRow = (openedAt: string) => csvOf(`Havana,Rhum,SPIRIT,700,1,,,,,${openedAt},,`);

  it.each([
    ['fr', '2024-03-12'],
    ['en', '2024-12-03'],
  ])('reads 12/03/2024 in the order of %s and sends it on as %s', (language, expected) => {
    const payload = parseCsvBottles(datedRow('12/03/2024'), language);
    expect(payload.errors).toEqual([]);
    expect(payload.bottles[0].openedAt).toBe(expected);
  });

  it.each(['fr', 'en'])('keeps the ISO timestamp of an export as written in %s', (language) => {
    const payload = parseCsvBottles(datedRow('2024-03-12T00:00:00.000Z'), language);
    expect(payload.bottles[0].openedAt).toBe('2024-03-12T00:00:00.000Z');
  });

  it.each(['fr', 'en'])('leaves out the rows with an unreadable date in %s and lists them', (language) => {
    const csv = csvOf(
      'Havana,Rhum,SPIRIT,700,1,,,,,31/02/2024,,',
      'Diplomatico,Rhum,SPIRIT,700,1,,,,,2024,,',
      'Bumbu,Rhum,SPIRIT,700,1,,,,,March 2024,,',
      'Plantation,Rhum,SPIRIT,700,1,,,,,12-03-24,,',
      'Kept,Rhum,SPIRIT,700,1,,,,,2024-03-12,,',
    );
    const payload = parseCsvBottles(csv, language);
    expect(payload.bottles.map((b) => b.name)).toEqual(['Kept']);
    expect(payload.errors).toEqual([2, 3, 4, 5].map((line) => (
      { source: 'bottles', line, field: 'openedAt', code: 'invalidDate' }
    )));
  });

  it('reads a JSON date in the language too', () => {
    const payload = parseJsonBottles({ version: 1, bottles: [jsonBottle({ openedAt: '25/03/2024' })] }, 'fr');
    expect(payload.bottles[0].openedAt).toBe('2024-03-25');
  });
});

describe('parseJsonBottles', () => {
  it('reads typed values, numbers given as text and booleans given as text', () => {
    const payload = parseJsonBottles({
      version: 1,
      bottles: [jsonBottle({ capacityMl: '750', isApero: 'false', isDigestif: 1, location: '', quantity: 3 })],
    }, 'en');
    expect(payload.bottles[0]).toEqual({
      name: 'Havana', categoryName: 'Rhum', capacityMl: 750, remainingPercent: 100,
      alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
      isApero: false, isDigestif: true, quantity: 3,
    });
  });

  it('numbers the rows from 1 in errors', () => {
    const payload = parseJsonBottles({
      version: 1,
      bottles: [jsonBottle(), jsonBottle({ remainingPercent: 150 }), jsonBottle({ openedAt: 12 }), 'not a bottle'],
    }, 'en');
    expect(payload.bottles).toHaveLength(1);
    expect(payload.errors).toEqual([
      { source: 'bottles', line: 2, field: 'remainingPercent', code: 'outOfRange' },
      { source: 'bottles', line: 3, field: 'openedAt', code: 'invalidDate' },
      { source: 'bottles', line: 4, field: 'name', code: 'required' },
    ]);
  });

  it('keeps a valid opening date as written', () => {
    const payload = parseJsonBottles({ version: 1, bottles: [jsonBottle({ openedAt: '2026-10-11' })] }, 'en');
    expect(payload.bottles[0].openedAt).toBe('2026-10-11');
  });

  it('leaves out categories with a negative desired stock or a minimum above 100', () => {
    const payload = parseJsonBottles({
      version: 1,
      categories: [
        { name: 'Rhum', type: 'SPIRIT', desiredStock: 2, minimumPercent: 30, nameTranslations: { fr: 'Rhum' } },
        { name: 'Gin', desiredStock: -1 },
        { name: 'Vodka', minimumPercent: 150 },
        { name: '' },
      ],
      bottles: [],
    }, 'en');
    expect(payload.categories).toEqual([
      { name: 'Rhum', type: 'SPIRIT', desiredStock: 2, minimumPercent: 30, nameTranslations: { fr: 'Rhum' } },
    ]);
    expect(payload.errors).toEqual([
      { source: 'categories', line: 2, field: 'desiredStock', code: 'outOfRange' },
      { source: 'categories', line: 3, field: 'minimumPercent', code: 'outOfRange' },
    ]);
  });

  it('drops translations the confirmation would refuse, and keeps the category', () => {
    const payload = parseJsonBottles({
      version: 1,
      categories: [
        { name: 'Rum', nameTranslations: { de: 'Rum' } },
        { name: 'Gin', nameTranslations: { en: 'Gin', fr: 42 } },
      ],
      bottles: [],
    }, 'en');
    expect(payload.categories.map((c) => c.nameTranslations)).toEqual([null, null]);
    expect(payload.errors).toEqual([]);
  });

  it('tells which list a reported line belongs to', () => {
    const payload = parseJsonBottles({
      version: 1,
      categories: [{ name: 'Rhum' }, { name: 'Gin', desiredStock: -1 }],
      bottles: [jsonBottle(), jsonBottle({ capacityMl: 0 })],
    }, 'en');
    expect(payload.errors).toEqual([
      { source: 'categories', line: 2, field: 'desiredStock', code: 'outOfRange' },
      { source: 'bottles', line: 2, field: 'capacityMl', code: 'outOfRange' },
    ]);
  });

  it.each([
    ['no version', { bottles: [] }, 'unsupportedVersion'],
    ['an array', [], 'unsupportedVersion'],
    ['no bottles array', { version: 1, bottles: {} }, 'bottlesRequired'],
  ])('refuses a file with %s', (_label, json, code) => {
    expect(parseError(() => parseJsonBottles(json, 'en')).code).toBe(code);
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows`, () => {
    const bottles = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => jsonBottle());
    expect(parseError(() => parseJsonBottles({ version: 1, bottles }, 'en')).code).toBe('tooManyRows');
  });
});

describe('parseImportFile', () => {
  it('reads a JSON file that starts with a BOM', () => {
    const file = Buffer.from(BOM + JSON.stringify({ version: 1, bottles: [jsonBottle()] }));
    expect(parseImportFile('bottles.JSON', file, 'en').bottles).toHaveLength(1);
  });

  it('reads a CSV file that starts with a BOM', () => {
    const file = Buffer.from(BOM + csvOf('Havana,Rhum,SPIRIT,700,1,,,,,,,'));
    expect(parseImportFile('bottles.csv', file, 'en').bottles).toHaveLength(1);
  });

  it('refuses a JSON file that does not parse', () => {
    expect(parseError(() => parseImportFile('bottles.json', Buffer.from('{ nope'), 'en')).code).toBe('invalidJson');
  });

  it('refuses another extension', () => {
    expect(parseError(() => parseImportFile('bottles.txt', Buffer.from(''), 'en')).code).toBe('unsupportedFormat');
  });
});

describe('parseZipBottles', () => {
  function zipOf(files: Record<string, string | Buffer>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return zip.toBuffer();
  }

  it('reads bottles.json and categories.csv with a BOM, and reports their invalid rows', () => {
    const zip = zipOf({
      'bottles.json': BOM + JSON.stringify({ version: 1, bottles: [jsonBottle()] }),
      'categories.csv': `${BOM}name;type;desiredStock;minimumPercent;nameTranslations\n`
        + 'Rhum;SPIRIT;3;25;"{""fr"":""Rhum""}"\nGin;SPIRIT;-2;30;',
    });

    const payload = parseZipBottles(zip, 'en');

    expect(payload.bottles).toHaveLength(1);
    expect(payload.categories).toEqual([
      { name: 'Rhum', type: 'SPIRIT', desiredStock: 3, minimumPercent: 25, nameTranslations: { fr: 'Rhum' } },
    ]);
    expect(payload.errors).toEqual([{ source: 'categories', line: 3, field: 'desiredStock', code: 'outOfRange' }]);
  });

  it('ignores a categories.csv without a name column', () => {
    const zip = zipOf({ 'bottles.csv': csvOf('Havana,Rhum,SPIRIT,700,1,,,,,,,'), 'categories.csv': 'type\nSPIRIT' });
    expect(parseZipBottles(zip, 'en').categories.map((c) => c.name)).toEqual(['Rhum']);
  });

  it('refuses an entry over 20 MB once uncompressed, before reading it', () => {
    const zip = zipOf({ 'bottles.csv': Buffer.alloc(MAX_ZIP_ENTRY_BYTES + 1, ' ') });
    expect(parseError(() => parseZipBottles(zip, 'en'))).toMatchObject({ code: 'zipEntryTooLarge', params: { maxMb: 20 } });
  });

  it('refuses an archive without bottles.csv or bottles.json', () => {
    expect(parseError(() => parseZipBottles(zipOf({ 'notes.txt': 'nope' }), 'en')).code).toBe('zipMissingBottles');
  });

  it('refuses a file that is not a ZIP archive', () => {
    expect(parseError(() => parseZipBottles(Buffer.from('not a zip'), 'en')).code).toBe('invalidZip');
  });

  it('refuses an archive whose entry does not decompress', () => {
    const zip = zipOf({ 'bottles.csv': csvOf('Havana,Rhum,SPIRIT,700,1,,,,,,,') });
    // Corrupts the compressed data that follows the 30-byte local header and the entry name
    const corrupted = Buffer.from(zip);
    corrupted.fill(0xff, 30 + 'bottles.csv'.length, 30 + 'bottles.csv'.length + 20);
    expect(parseError(() => parseZipBottles(corrupted, 'en')).code).toBe('invalidZip');
  });
});
