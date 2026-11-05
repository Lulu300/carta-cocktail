import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { i18n as I18n } from 'i18next';

// Uses the real i18next instance: setup.ts only mocks react-i18next.
// navigator.language(s) are read-only in jsdom, so they are stubbed through their getters.
// Some browsers (Safari) only report the regional locale, without its base language.
function stubBrowserLanguage(locale: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale);
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue([locale]);
}

// The detector caches the chosen language in localStorage and reads it before the browser locale.
function clearCachedLanguage() {
  localStorage.removeItem('i18nextLng');
}

describe('i18n language detection', () => {
  let i18n: I18n;

  beforeAll(async () => {
    // Same starting point as index.html: the browser locale must win over it.
    document.documentElement.lang = 'en';
    clearCachedLanguage();
    stubBrowserLanguage('fr-FR');
    vi.resetModules();
    i18n = (await import('./index')).default;
    await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
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
    localStorage.setItem('i18nextLng', 'en');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en');
  });

  it('should restore English (UK) from localStorage', async () => {
    await i18n.changeLanguage('fr');
    stubBrowserLanguage('fr-FR');
    localStorage.setItem('i18nextLng', 'en-GB');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('should resolve a regional locale already cached in localStorage', async () => {
    await i18n.changeLanguage('en');
    stubBrowserLanguage('en-US');
    localStorage.setItem('i18nextLng', 'fr-FR');
    await i18n.changeLanguage();
    expect(i18n.language).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
