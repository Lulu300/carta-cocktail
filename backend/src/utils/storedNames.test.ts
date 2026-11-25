import { describe, it, expect } from 'vitest';
import { nameToStore, translationsToStore } from './storedNames';

const COMPOSED = 'Crème';
const DECOMPOSED = 'Crème';

describe('nameToStore', () => {
  it('should compose a new name', () => {
    expect(nameToStore(DECOMPOSED)).toBe(COMPOSED);
    expect(nameToStore(COMPOSED)).toBe(COMPOSED);
  });

  it('should keep a stored name sent back as it is', () => {
    expect(nameToStore(DECOMPOSED, DECOMPOSED)).toBe(DECOMPOSED);
  });

  it('should compose a name that differs from the stored one', () => {
    expect(nameToStore('CRÈME', DECOMPOSED)).toBe('CRÈME');
    expect(nameToStore(DECOMPOSED, null)).toBe(COMPOSED);
  });

  // NFC only, as for category types (C-61): NFKC would change characters drawn differently
  it('should keep compatibility characters', () => {
    expect(nameToStore('ﬁno')).toBe('ﬁno');
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
    const stored = JSON.stringify({ fr: DECOMPOSED, en: 'Crèam' });

    expect(translationsToStore({ fr: DECOMPOSED, en: 'Crèam!' }, stored)).toEqual({ fr: DECOMPOSED, en: 'Crèam!' });
    // The French text of the stored English translation is not the stored French one
    expect(translationsToStore({ fr: 'Crèam' }, stored)).toEqual({ fr: 'Crèam' });
  });

  it('should leave a blank translation blank, for serializeTranslations to drop', () => {
    expect(translationsToStore({ fr: '', en: DECOMPOSED })).toEqual({ fr: '', en: COMPOSED });
  });
});
