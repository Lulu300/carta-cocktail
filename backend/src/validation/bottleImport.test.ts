import { describe, it, expect } from 'vitest';
import { BottleImportConfirm, BottleImportPayload, MAX_IMPORT_BOTTLES, MAX_IMPORT_ROWS } from './bottleImport';

// A row as POST /bottles/import/preview returns it
const row = {
  name: 'Havana', categoryName: 'Rum', capacityMl: 700, remainingPercent: 100,
  alcoholPercentage: 40, purchasePrice: 0, location: null, openedAt: '2026-10-01',
  isApero: false, isDigestif: true, quantity: 2,
};

function payloadWith(bottles: unknown[]) {
  return { version: 1, categories: [], bottles };
}

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('BottleImportPayload', () => {
  it('accepts the payload of the preview and keeps a price of 0', () => {
    const parsed = BottleImportPayload.parse(payloadWith([row]));
    expect(parsed.bottles[0].purchasePrice).toBe(0);
    expect(parsed.bottles[0].openedAt).toEqual(new Date('2026-10-01'));
  });

  it('fills the defaults of a sparse row', () => {
    const parsed = BottleImportPayload.parse(payloadWith([{ name: 'Havana', categoryName: '', capacityMl: 700 }]));
    expect(parsed.bottles[0]).toMatchObject({ remainingPercent: 100, quantity: 1, purchasePrice: null, isApero: false });
  });

  it.each([
    ['capacityMl', 0],
    ['remainingPercent', 150],
    ['alcoholPercentage', 101],
    ['purchasePrice', -5],
    ['openedAt', 'someday'],
    ['quantity', 51],
  ])('rejects %s = %s', (field, value) => {
    expect(issuePaths(BottleImportPayload.safeParse(payloadWith([{ ...row, [field]: value }])))).toEqual([`bottles.0.${field}`]);
  });

  it(`accepts ${MAX_IMPORT_ROWS} rows and rejects one more`, () => {
    const single = { ...row, quantity: 1 };
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, () => single);
    expect(BottleImportPayload.safeParse(payloadWith(rows)).success).toBe(true);
    const tooMany = BottleImportPayload.safeParse(payloadWith([...rows, single]));
    // 2,001 rows of one bottle each also break the bottle limit: both issues name the array
    expect(new Set(issuePaths(tooMany))).toEqual(new Set(['bottles']));
    expect(tooMany.error?.issues[0].code).toBe('too_big');
  });

  it(`accepts ${MAX_IMPORT_BOTTLES} bottles, quantities included, and rejects one more`, () => {
    const rows = Array.from({ length: MAX_IMPORT_BOTTLES / 2 }, () => row);
    expect(BottleImportPayload.safeParse(payloadWith(rows)).success).toBe(true);
    const oneMore = [...rows, { ...row, quantity: 1 }];
    expect(issuePaths(BottleImportPayload.safeParse(payloadWith(oneMore)))).toEqual(['bottles']);
  });

  it('accepts version 1 only', () => {
    expect(issuePaths(BottleImportPayload.safeParse({ version: 2, bottles: [] }))).toEqual(['version']);
  });
});

describe('BottleImportConfirm', () => {
  it('fills the defaults of a category to create', () => {
    const parsed = BottleImportConfirm.parse({
      payload: payloadWith([row]),
      resolutions: { categories: { rum: { action: 'create', data: { name: 'Rum' } } } },
    });
    expect(parsed.resolutions?.categories?.rum).toEqual({
      action: 'create',
      data: { name: 'Rum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30 },
    });
  });

  it('accepts a blank category name, which the route replaces with the key', () => {
    const parsed = BottleImportConfirm.parse({
      payload: payloadWith([row]),
      resolutions: { categories: { rum: { action: 'create', data: { name: '  ' } } } },
    });
    expect(parsed.resolutions?.categories?.rum).toMatchObject({ data: { name: '' } });
  });

  it('rejects an unknown action', () => {
    const result = BottleImportConfirm.safeParse({
      payload: payloadWith([row]),
      resolutions: { bottles: { 0: { action: 'merge' } } },
    });
    expect(result.success).toBe(false);
  });
});
