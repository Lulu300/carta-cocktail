import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { takeMissingKeys } from './missingKeys';

describe('missing translation keys', () => {
  it('reports a key found in no bundle', () => {
    // The only place where an invented key is allowed: setup.ts fails any other test that shows one.
    expect(i18n.t('tests.inventedKey')).toBe('tests.inventedKey');
    expect(takeMissingKeys()).toEqual(['tests.inventedKey']);
  });

  it('reports a key once, however often it is shown', () => {
    i18n.t('tests.inventedKey');
    i18n.t('tests.inventedKey');
    expect(takeMissingKeys()).toEqual(['tests.inventedKey']);
  });

  it('does not report the keys of the public and admin bundles', () => {
    expect(i18n.t('units.title')).toBe('Units');
    expect(i18n.t('public.back')).not.toBe('public.back');
    expect(takeMissingKeys()).toEqual([]);
  });

  it('serves the French messages without reporting anything', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('units.title')).toBe('Unités');
    expect(takeMissingKeys()).toEqual([]);
  });
});
