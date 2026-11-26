import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseNameTranslations, parseTranslations, serializeTranslations } from './translations';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serializeTranslations', () => {
  it('should store the filled languages as JSON', () => {
    expect(serializeTranslations({ fr: 'Rhum', en: 'Rum' })).toBe('{"fr":"Rhum","en":"Rum"}');
  });

  it('should leave blank languages out', () => {
    expect(serializeTranslations({ fr: 'Rhum', en: '' })).toBe('{"fr":"Rhum"}');
  });

  it('should clear the column for null, an empty object or blank languages only', () => {
    expect(serializeTranslations(null)).toBeNull();
    expect(serializeTranslations({})).toBeNull();
    expect(serializeTranslations({ fr: '', en: '' })).toBeNull();
  });

  it('should leave the column untouched when the field is absent', () => {
    expect(serializeTranslations(undefined)).toBeUndefined();
  });
});

describe('parseTranslations', () => {
  it('should read a stored JSON object', () => {
    expect(parseTranslations('{"fr":"Rhum","en":"Rum"}')).toEqual({ fr: 'Rhum', en: 'Rum' });
  });

  it('should keep languages stored before the validation', () => {
    expect(parseTranslations('{"de":"Rum"}')).toEqual({ de: 'Rum' });
  });

  it('should read an empty column as null without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTranslations(null)).toBeNull();
    expect(parseTranslations(undefined)).toBeNull();
    expect(parseTranslations('')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['invalid-json', '["Rhum"]', '42', 'null'])('should log and read %s as null', (raw) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTranslations(raw)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(raw));
  });
});

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
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('should return a copy and leave the input untouched', () => {
    const unit = { name: 'cl', nameTranslations: '{"fr":"centilitre"}' };
    const input = { name: 'Line', nameTranslations: '{"fr":"Ligne"}', unit };
    const result = parseNameTranslations(input);
    expect(result).toEqual({
      name: 'Line',
      nameTranslations: { fr: 'Ligne' },
      unit: { name: 'cl', nameTranslations: { fr: 'centilitre' } },
    });
    expect(input).toEqual({
      name: 'Line',
      nameTranslations: '{"fr":"Ligne"}',
      unit: { name: 'cl', nameTranslations: '{"fr":"centilitre"}' },
    });
    expect(input.unit).toBe(unit);
  });
});
