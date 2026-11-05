import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { i18n as I18n } from 'i18next';
import { LANGUAGE_STORAGE_KEY, LEGACY_LANGUAGE_STORAGE_KEY, storeLanguageChoice } from '../utils/languageChoice';

// Uses the real i18next instance: setup.ts only mocks react-i18next.
// navigator.language(s) are read-only in jsdom, so they are stubbed through their getters.
// Some browsers (Safari) only report the regional locale, without its base language.
function stubBrowserLanguage(locale: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale);
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue([locale]);
}

// The detector reads the language picked in the selector before the browser locale.
function clearCachedLanguage() {
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
}

/** Loads the app's i18n as a page load does: a fresh module, so its startup code runs again. */
async function loadI18n(): Promise<I18n> {
  vi.resetModules();
  const i18n = (await import('./index')).default;
  await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
  return i18n;
}

describe('i18n language detection', () => {
  let i18n: I18n;

  beforeAll(async () => {
    // Same starting point as index.html: the browser locale must win over it.
    document.documentElement.lang = 'en';
    clearCachedLanguage();
    stubBrowserLanguage('fr-FR');
    i18n = await loadI18n();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCachedLanguage();
  });

  it('should resolve a regional browser locale to its supported base language on startup', () => {
    expect(i18n.language).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('should update the html lang attribute when the language changes', async () => {
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('should resolve an en-US browser locale to English', async () => {
    await i18n.changeLanguage('fr');
    clearCachedLanguage();
    stubBrowserLanguage('en-US');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('should fall back to English for an unsupported browser locale', async () => {
    // <html lang="fr"> from the previous choice must not be picked up by the detector.
    await i18n.changeLanguage('fr');
    clearCachedLanguage();
    stubBrowserLanguage('de-DE');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('should keep an en-GB browser locale as English (UK), served the English messages', async () => {
    await i18n.changeLanguage('fr');
    clearCachedLanguage();
    stubBrowserLanguage('en-GB');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en-GB');
    expect(i18n.resolvedLanguage).toBe('en');
    expect(i18n.t('nav.language')).toBe('Language');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  // Older Safari versions reported the region in lower case ("en-gb").
  it('should match the region of a supported locale whatever its case', async () => {
    await i18n.changeLanguage('fr');
    clearCachedLanguage();
    stubBrowserLanguage('en-gb');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en-GB');
  });

  // Other English variants also write the day first, but only en-GB is an app language.
  it.each(['en-AU', 'en-IE', 'en-NZ', 'en-IN'])('should resolve an %s browser locale to English (US)', async (locale) => {
    await i18n.changeLanguage('fr');
    clearCachedLanguage();
    stubBrowserLanguage(locale);
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en');
  });

  it('should keep English (US) for an admin who chose en, even with an en-GB browser', async () => {
    await i18n.changeLanguage('fr');
    stubBrowserLanguage('en-GB');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en');
  });

  it('should restore English (UK) from localStorage', async () => {
    await i18n.changeLanguage('fr');
    stubBrowserLanguage('fr-FR');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en-GB');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('should resolve a regional locale already cached in localStorage', async () => {
    await i18n.changeLanguage('en');
    stubBrowserLanguage('en-US');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr-FR');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  // Only the selector stores a language: a detected one would hide a language added later.
  it('should store neither a detected language nor a changed one', async () => {
    stubBrowserLanguage('en-GB');
    await i18n.changeLanguage();
    await i18n.changeLanguage('fr');
    expect(localStorage.length).toBe(0);
  });
});

describe('i18n language at page load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep a language picked in the selector across reloads', async () => {
    stubBrowserLanguage('fr-FR');
    storeLanguageChoice('en-GB');
    const i18n = await loadI18n();
    expect(i18n.language).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('should detect English (UK) again where an older version cached en', async () => {
    stubBrowserLanguage('en-GB');
    localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, 'en');
    const i18n = await loadI18n();
    expect(i18n.language).toBe('en-GB');
    expect(localStorage.length).toBe(0);
  });

  it('should keep en cached by an older version on a French browser as a choice', async () => {
    stubBrowserLanguage('fr-FR');
    localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, 'en');
    const i18n = await loadI18n();
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
});
