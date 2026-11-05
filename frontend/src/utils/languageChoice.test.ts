import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  LEGACY_LANGUAGE_STORAGE_KEY,
  migrateLegacyLanguage,
  storeLanguageChoice,
} from './languageChoice';

// navigator.language(s) are read-only in jsdom, so they are stubbed through their getters.
function stubBrowserLanguages(languages: string[], language = languages[0] ?? '') {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
}

/** Runs the migration with a value cached by an older version on a browser in these languages. */
function migrate(legacy: string, languages: string[]) {
  stubBrowserLanguages(languages);
  localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, legacy);
  migrateLegacyLanguage();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storeLanguageChoice', () => {
  it('stores the picked language', () => {
    storeLanguageChoice('en-GB');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-GB');
  });

  it('keeps going when the browser blocks site data', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => storeLanguageChoice('fr')).not.toThrow();
  });
});

describe('migrateLegacyLanguage', () => {
  it('does nothing without a value cached by an older version', () => {
    stubBrowserLanguages(['fr-FR']);
    migrateLegacyLanguage();
    expect(localStorage.length).toBe(0);
  });

  // What the older version detected from this browser: nobody needs to have picked it.
  it.each([
    ['en', ['en-GB']],
    ['en', ['en-US']],
    ['fr', ['fr-FR']],
    ['fr-FR', ['fr-CA']],
    ['en', ['de-DE']],
    ['en', ['de-DE', 'en-GB']],
    ['fr', ['de-DE', 'fr-FR', 'en-GB']],
  ])('drops %j on a browser in %j, to detect the language again', (legacy, languages) => {
    migrate(legacy, languages);
    expect(localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  // The older version would have detected another language: this one was picked in the selector.
  it.each([
    ['en', ['fr-FR']],
    ['fr', ['en-GB']],
    ['fr', ['de-DE']],
    ['en', ['de-DE', 'fr-FR']],
  ])('keeps %j on a browser in %j as a choice', (legacy, languages) => {
    migrate(legacy, languages);
    expect(localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(legacy);
  });

  it('reads navigator.language when the browser gives no list', () => {
    stubBrowserLanguages([], 'fr-FR');
    localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, 'fr');
    migrateLegacyLanguage();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('lets a choice made with this version win over the cached value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en-GB');
    migrate('en', ['fr-FR']);
    expect(localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-GB');
  });

  it('keeps going when the browser blocks site data', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => migrateLegacyLanguage()).not.toThrow();
  });
});
