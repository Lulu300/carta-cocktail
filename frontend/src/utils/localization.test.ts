import { describe, it, expect } from 'vitest';
import { getBaseLanguage, getLocalizedName } from './localization';

describe('getBaseLanguage', () => {
  it('should strip the region from a regional locale', () => {
    expect(getBaseLanguage('fr-FR')).toBe('fr');
  });

  it('should keep a base language unchanged', () => {
    expect(getBaseLanguage('en')).toBe('en');
  });
});

describe('getLocalizedName', () => {
  const rum = { name: 'Rum', nameTranslations: { fr: 'Rhum', en: 'Rum' } };

  it('should resolve a regional French locale to the French translation', () => {
    expect(getLocalizedName(rum, 'fr-FR')).toBe('Rhum');
  });

  it('should resolve a regional English locale to the English translation', () => {
    expect(getLocalizedName(rum, 'en-US')).toBe('Rum');
  });

  it('should fall back to English for an unsupported language', () => {
    expect(getLocalizedName(rum, 'de')).toBe('Rum');
  });

  it('should prefer an exact regional translation when one exists', () => {
    const entity = { name: 'Rum', nameTranslations: { 'fr-CA': 'Rhum QC', fr: 'Rhum' } };
    expect(getLocalizedName(entity, 'fr-CA')).toBe('Rhum QC');
  });

  it('should return name when translations is null for a regional locale', () => {
    expect(getLocalizedName({ name: 'Rum', nameTranslations: null }, 'fr-FR')).toBe('Rum');
  });

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
