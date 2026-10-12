import { describe, it, expect } from 'vitest';
import { buildNameTranslations, toTranslationForm } from './translations';

describe('toTranslationForm', () => {
  it('reads the French and English names', () => {
    expect(toTranslationForm({ fr: 'Citron', en: 'Lemon' })).toEqual({ fr: 'Citron', en: 'Lemon' });
  });

  it('gives empty fields for missing translations', () => {
    expect(toTranslationForm(null)).toEqual({ fr: '', en: '' });
    expect(toTranslationForm(undefined)).toEqual({ fr: '', en: '' });
    expect(toTranslationForm({ fr: 'Citron' })).toEqual({ fr: 'Citron', en: '' });
  });
});

describe('buildNameTranslations', () => {
  it('keeps the filled languages, trimmed', () => {
    expect(buildNameTranslations({ fr: ' Citron ', en: 'Lemon' })).toEqual({ fr: 'Citron', en: 'Lemon' });
  });

  it('leaves blank languages out', () => {
    expect(buildNameTranslations({ fr: 'Citron', en: '   ' })).toEqual({ fr: 'Citron' });
  });

  it('returns null when no language is filled', () => {
    expect(buildNameTranslations({ fr: '', en: ' ' })).toBeNull();
  });
});
