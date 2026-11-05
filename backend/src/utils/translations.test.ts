import { describe, it, expect } from 'vitest';
import { parseNameTranslations } from './translations';

describe('parseNameTranslations', () => {
  it('should return null for null input', () => {
    expect(parseNameTranslations(null)).toBeNull();
  });

  it('should return undefined for undefined input', () => {
    expect(parseNameTranslations(undefined)).toBeUndefined();
  });

  it('should return other values than objects and arrays unchanged', () => {
    expect(parseNameTranslations('Rum')).toBe('Rum');
    expect(parseNameTranslations(42)).toBe(42);
  });

  it('should parse a valid JSON string in nameTranslations', () => {
    const obj = { name: 'Vodka', nameTranslations: '{"fr":"Vodka","en":"Vodka"}' };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({ name: 'Vodka', nameTranslations: { fr: 'Vodka', en: 'Vodka' } });
  });

  it('should set nameTranslations to null on invalid JSON', () => {
    const obj = { name: 'Test', nameTranslations: 'invalid-json' };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({ name: 'Test', nameTranslations: null });
  });

  it('should handle arrays of objects recursively', () => {
    const arr = [
      { name: 'A', nameTranslations: '{"fr":"A-fr"}' },
      { name: 'B', nameTranslations: '{"fr":"B-fr"}' },
    ];
    const result = parseNameTranslations(arr);
    expect(result).toEqual([
      { name: 'A', nameTranslations: { fr: 'A-fr' } },
      { name: 'B', nameTranslations: { fr: 'B-fr' } },
    ]);
  });

  it('should recurse into known relation fields', () => {
    const obj = {
      name: 'Cocktail',
      nameTranslations: null,
      unit: { name: 'cl', nameTranslations: '{"fr":"centilitre"}' },
      category: { name: 'Spirit', nameTranslations: '{"fr":"Spiritueux"}' },
    };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({
      name: 'Cocktail',
      nameTranslations: null,
      unit: { name: 'cl', nameTranslations: { fr: 'centilitre' } },
      category: { name: 'Spirit', nameTranslations: { fr: 'Spiritueux' } },
    });
  });

  it('should not modify objects without nameTranslations', () => {
    const obj = { id: 1, name: 'Test' };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('should handle deeply nested relations', () => {
    const obj = {
      name: 'Test',
      nameTranslations: null,
      ingredients: [
        {
          name: 'Ing1',
          nameTranslations: '{"fr":"Ing1-fr"}',
          bottle: { name: 'Bottle', nameTranslations: '{"fr":"Bouteille"}' },
        },
      ],
    };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({
      name: 'Test',
      nameTranslations: null,
      ingredients: [
        {
          name: 'Ing1',
          nameTranslations: { fr: 'Ing1-fr' },
          bottle: { name: 'Bottle', nameTranslations: { fr: 'Bouteille' } },
        },
      ],
    });
  });

  it('should leave non-string nameTranslations as-is', () => {
    const obj = { name: 'Test', nameTranslations: { fr: 'already parsed' } };
    const result = parseNameTranslations(obj);
    expect(result).toEqual({ name: 'Test', nameTranslations: { fr: 'already parsed' } });
  });
});
