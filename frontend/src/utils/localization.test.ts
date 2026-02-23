import { describe, it, expect } from 'vitest';
import { getLocalizedName } from './localization';

describe('getLocalizedName', () => {
  it('should return name when no translations', () => {
    expect(getLocalizedName({ name: 'Vodka' }, 'fr')).toBe('Vodka');
  });

  it('should return name when translations is null', () => {
    expect(getLocalizedName({ name: 'Vodka', nameTranslations: null }, 'fr')).toBe('Vodka');
  });

  it('should return translation for current locale', () => {
    const entity = { name: 'Vodka', nameTranslations: { fr: 'Vodka FR', en: 'Vodka EN' } };
    expect(getLocalizedName(entity, 'fr')).toBe('Vodka FR');
  });

  it('should fallback to en when locale not found', () => {
    const entity = { name: 'Vodka', nameTranslations: { en: 'Vodka EN' } };
    expect(getLocalizedName(entity, 'de')).toBe('Vodka EN');
  });

  it('should fallback to any available translation', () => {
    const entity = { name: 'Vodka', nameTranslations: { es: 'Vodka ES' } };
    expect(getLocalizedName(entity, 'de')).toBe('Vodka ES');
  });

  it('should fallback to entity.name when translations is empty object', () => {
    const entity = { name: 'Vodka', nameTranslations: {} };
    expect(getLocalizedName(entity, 'fr')).toBe('Vodka');
  });

  it('should handle non-object translations', () => {
    const entity = { name: 'Vodka', nameTranslations: 'invalid' as unknown as Record<string, string> };
    expect(getLocalizedName(entity, 'fr')).toBe('Vodka');
  });
});
