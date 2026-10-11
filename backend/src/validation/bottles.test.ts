import { describe, it, expect } from 'vitest';
import { BottleCreate, BottleExportQuery, BottleListQuery, BottleUpdate } from './bottles';

const validBottle = { name: 'Havana', categoryId: 1, capacityMl: 700 };

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('BottleCreate', () => {
  it('accepts the fields the bottle form sends', () => {
    const body = {
      ...validBottle, purchasePrice: null, remainingPercent: 100, openedAt: null,
      alcoholPercentage: null, location: null, isApero: false, isDigestif: false, quantity: 3,
    };
    expect(BottleCreate.safeParse(body).success).toBe(true);
  });

  it('keeps a purchase price of 0', () => {
    expect(BottleCreate.parse({ ...validBottle, purchasePrice: 0 }).purchasePrice).toBe(0);
  });

  it.each([
    ['capacityMl', 0],
    ['capacityMl', 70.5],
    ['remainingPercent', 150],
    ['alcoholPercentage', 100.1],
    ['alcoholPercentage', -1],
    ['purchasePrice', -0.01],
    ['openedAt', 'soon'],
    ['quantity', 0],
    ['quantity', 51],
    ['categoryId', '3'],
  ])('rejects %s = %s', (field, value) => {
    expect(issuePaths(BottleCreate.safeParse({ ...validBottle, [field]: value }))).toEqual([field]);
  });

  it('requires a name, a category and a capacity', () => {
    expect(issuePaths(BottleCreate.safeParse({})).sort()).toEqual(['capacityMl', 'categoryId', 'name']);
  });
});

describe('BottleUpdate', () => {
  it('accepts a partial update', () => {
    expect(BottleUpdate.parse({ remainingPercent: 0 })).toEqual({ remainingPercent: 0 });
  });

  it('applies the same bounds as the creation', () => {
    expect(BottleUpdate.safeParse({ remainingPercent: 150 }).success).toBe(false);
  });
});

describe('bottle queries', () => {
  it('coerces categoryId and rejects a non-numeric one', () => {
    expect(BottleListQuery.parse({ categoryId: '4' })).toEqual({ categoryId: 4 });
    expect(BottleListQuery.safeParse({ categoryId: 'x' }).success).toBe(false);
  });

  it('defaults the export format to json and reads it ignoring case', () => {
    expect(BottleExportQuery.parse({}).format).toBe('json');
    expect(BottleExportQuery.parse({ format: 'CSV' }).format).toBe('csv');
    expect(BottleExportQuery.safeParse({ format: 'xml' }).success).toBe(false);
  });
});
