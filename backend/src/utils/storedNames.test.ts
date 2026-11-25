import { describe, it, expect } from 'vitest';
import { nameToStore, translationsToStore } from './storedNames';

const COMPOSED = 'Cr\u00E8me';
const DECOMPOSED = 'Cre\u0300me';

describe('nameToStore', () => {
  it('should compose a new name', () => {
    expect(nameToStore(DECOMPOSED)).toBe(COMPOSED);
    expect(nameToStore(COMPOSED)).toBe(COMPOSED);
  });

  it('should keep a stored name sent back as it is', () => {
    expect(nameToStore(DECOMPOSED, DECOMPOSED)).toBe(DECOMPOSED);
  });

  it('should compose a name that differs from the stored one', () => {
    expect(nameToStore('CRE\u0300ME', DECOMPOSED)).toBe('CR\u00C8ME');
    expect(nameToStore(DECOMPOSED, null)).toBe(COMPOSED);
  });

  // NFC only, as for category types (C-61): NFKC would change characters drawn differently
  it('should keep compatibility characters', () => {
    expect(nameToStore('\uFB01no')).toBe('\uFB01no');
  });
});

describe('translationsToStore', () => {
  it('should pass an absent or cleared field through', () => {
    expect(translationsToStore(undefined, JSON.stringify({ fr: DECOMPOSED }))).toBeUndefined();
    expect(translationsToStore(null, JSON.stringify({ fr: DECOMPOSED }))).toBeNull();
  });

  it('should compose each new translation', () => {
    expect(translationsToStore({ fr: DECOMPOSED, en: 'Cream' })).toEqual({ fr: COMPOSED, en: 'Cream' });
  });

  it('should keep a stored translation sent back as it is, language by language', () => {
    const stored = JSON.stringify({ fr: DECOMPOSED, en: 'Cre\u0300am' });

    expect(translationsToStore({ fr: DECOMPOSED, en: 'Cre\u0300am!' }, stored)).toEqual({ fr: DECOMPOSED, en: 'Cr\u00E8am!' });
    // The French text of the stored English translation is not the stored French one
    expect(translationsToStore({ fr: 'Cre\u0300am' }, stored)).toEqual({ fr: 'Cr\u00E8am' });
  });

  it('should leave a blank translation blank, for serializeTranslations to drop', () => {
    expect(translationsToStore({ fr: '', en: DECOMPOSED })).toEqual({ fr: '', en: COMPOSED });
  });
});
