import { describe, it, expect, vi } from 'vitest';
import { assertUniqueIgnoringCase, CaseInsensitiveIndex, previewMatch } from './uniqueness';

interface Row {
  id: number;
  name: string;
}

function indexOf(...names: string[]) {
  return new CaseInsensitiveIndex<Row>(names.map((name, i) => ({ id: i + 1, name })), (row) => row.name);
}

describe('CaseInsensitiveIndex.match', () => {
  it('should find the only row equal ignoring case', () => {
    expect(indexOf('Rum', 'Gin').match('rUM')).toEqual({ status: 'found', row: { id: 1, name: 'Rum' } });
  });

  it('should prefer the exact row to the others equal ignoring case', () => {
    expect(indexOf('Rum', 'rum', 'RUM').match('rum')).toEqual({ status: 'found', row: { id: 2, name: 'rum' } });
  });

  it('should be ambiguous when several rows are equal ignoring case and none exactly', () => {
    expect(indexOf('Rum', 'RUM', 'Gin').match('rum')).toEqual({
      status: 'ambiguous', rows: [{ id: 1, name: 'Rum' }, { id: 2, name: 'RUM' }],
    });
  });

  it('should find nothing for another name', () => {
    expect(indexOf('Rum').match('Rhum')).toEqual({ status: 'none' });
  });

  // C-65: 'Crème' and 'Crème' look the same
  it('should find the only row equal ignoring case and Unicode form, accents included', () => {
    expect(indexOf('Crème', 'Gin').match('Crème')).toEqual({ status: 'found', row: { id: 1, name: 'Crème' } });
    expect(indexOf('Crème').match('CRÈME')).toEqual({ status: 'found', row: { id: 1, name: 'Crème' } });
    expect(indexOf('Écorce').match('écorce')).toEqual({ status: 'found', row: { id: 1, name: 'Écorce' } });
  });

  it('should be ambiguous between a name and its decomposed form, unless one is exact', () => {
    const index = indexOf('Crème', 'Crème');

    expect(index.match('CRÈME')).toEqual({
      status: 'ambiguous', rows: [{ id: 1, name: 'Crème' }, { id: 2, name: 'Crème' }],
    });
    expect(index.match('Crème')).toEqual({ status: 'found', row: { id: 2, name: 'Crème' } });
  });

  // Same cases as matchIgnoringCase in frontend/src/components/import/importResolutions.test.ts
  it('should match a Greek letter that upper case decomposes', () => {
    expect(indexOf('ΐ').match('Ϊ́')).toEqual({ status: 'found', row: { id: 1, name: 'ΐ' } });
    expect(indexOf('ΐ').match('Ϊ́')).toEqual({ status: 'found', row: { id: 1, name: 'ΐ' } });
  });

  it('should find a row added after its creation', () => {
    const index = indexOf();
    index.add({ id: 7, name: 'Mezcal' });

    expect(index.match('MEZCAL')).toEqual({ status: 'found', row: { id: 7, name: 'Mezcal' } });
  });
});

describe('CaseInsensitiveIndex.matchFirst', () => {
  it('should prefer the exact row, else take the first one equal ignoring case, never ambiguous', () => {
    const index = indexOf('Lime', 'lime', 'LIME');

    expect(index.matchFirst('lime')).toEqual({ status: 'found', row: { id: 2, name: 'lime' } });
    expect(index.matchFirst('lIME')).toEqual({ status: 'found', row: { id: 1, name: 'Lime' } });
    expect(index.matchFirst('Mint')).toEqual({ status: 'none' });
  });
});

describe('CaseInsensitiveIndex.findUnambiguous', () => {
  it('should refuse an ambiguous name with a 409 naming it and its matches', () => {
    expect(() => indexOf('Rum', 'RUM').findUnambiguous('rum', 'errors.ambiguousCategoryName')).toThrow(
      expect.objectContaining({ status: 409, i18nKey: 'errors.ambiguousCategoryName', details: { name: 'rum', matches: 'Rum, RUM' } }),
    );
  });

  it('should return the row found, or null', () => {
    const index = indexOf('Rum', 'RUM');

    expect(index.findUnambiguous('RUM', 'errors.ambiguousCategoryName')).toEqual({ id: 2, name: 'RUM' });
    expect(index.findUnambiguous('Gin', 'errors.ambiguousCategoryName')).toBeNull();
  });
});

describe('CaseInsensitiveIndex.findOrCreate', () => {
  it('should use a row equal ignoring case instead of creating one', async () => {
    const create = vi.fn();

    const row = await indexOf('Rum').findOrCreate('rum', 'errors.ambiguousCategoryName', create);

    expect(row).toEqual({ id: 1, name: 'Rum' });
    expect(create).not.toHaveBeenCalled();
  });

  it('should create a missing row once, then find it', async () => {
    const index = indexOf('Rum');
    const create = vi.fn(async () => ({ id: 9, name: 'Gin' }));

    await index.findOrCreate('Gin', 'errors.ambiguousCategoryName', create);
    const again = await index.findOrCreate('GIN', 'errors.ambiguousCategoryName', create);

    expect(again).toEqual({ id: 9, name: 'Gin' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('should create nothing for an ambiguous name', async () => {
    const create = vi.fn();

    await expect(indexOf('Rum', 'RUM').findOrCreate('rum', 'errors.ambiguousCategoryName', create))
      .rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('previewMatch', () => {
  const toPreview = (row: Row) => ({ id: row.id, label: row.name });

  it('should describe each kind of match', () => {
    const index = indexOf('Rum', 'RUM', 'Gin');

    expect(previewMatch(index.match('gin'), toPreview)).toEqual({ existingMatch: { id: 3, label: 'Gin' }, status: 'matched' });
    expect(previewMatch(index.match('Rhum'), toPreview)).toEqual({ existingMatch: null, status: 'missing' });
    expect(previewMatch(index.match('rum'), toPreview)).toEqual({
      existingMatch: null,
      status: 'ambiguous',
      ambiguousMatches: [{ id: 1, label: 'Rum' }, { id: 2, label: 'RUM' }],
    });
  });
});

describe('assertUniqueIgnoringCase', () => {
  const rows = [{ id: 1, value: 'cl' }, { id: 2, value: 'ml' }];

  it('should refuse a value another row holds ignoring case', () => {
    expect(() => assertUniqueIgnoringCase(rows, 'CL')).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('should refuse the decomposed form of a value another row holds', () => {
    expect(() => assertUniqueIgnoringCase([{ id: 1, value: 'écorce' }], 'ÉCORCE')).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("should accept a row's own value in another case, and a new value", () => {
    expect(() => assertUniqueIgnoringCase(rows, 'CL', 1)).not.toThrow();
    expect(() => assertUniqueIgnoringCase(rows, 'oz')).not.toThrow();
  });

  it('should refuse a value that several rows hold ignoring case', () => {
    expect(() => assertUniqueIgnoringCase([...rows, { id: 3, value: 'CL' }], 'Cl', 1)).toThrow(
      expect.objectContaining({ status: 409, i18nKey: 'errors.duplicateEntry' }),
    );
  });
});
