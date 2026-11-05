/**
 * The language picked in the selector, kept in localStorage. Only an explicit choice is stored:
 * a detected language is detected again at each start, so a guest or an admin who never picked
 * one follows the browser, and a language added later (English (UK)) reaches them.
 */

import { FALLBACK_LANGUAGE, getBaseLanguage } from './localization';

/** Holds the language picked in the selector, and nothing else. */
export const LANGUAGE_STORAGE_KEY = 'language';

/** Where v1.11 and older versions cached the detected language, picked or not. */
export const LEGACY_LANGUAGE_STORAGE_KEY = 'i18nextLng';

/** The languages of v1.11 and older versions, to replay their detection. */
const LEGACY_LANGUAGES = ['fr', 'en'];

/** Keeps the language the admin or a guest picked in the selector. */
export function storeLanguageChoice(language: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Site data blocked: the choice lasts until the page is closed.
  }
}

/** The browser's languages, preferred first, as the language detector reads them. */
function browserLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/**
 * What v1.11 detected from this browser: the first browser language whose base language it
 * supported, otherwise English.
 */
function legacyDetectedLanguage(): string {
  const bases = browserLanguages().filter(Boolean).map(getBaseLanguage);
  return bases.find((base) => LEGACY_LANGUAGES.includes(base)) ?? FALLBACK_LANGUAGE;
}

/**
 * Turns the language cached by an older version into an explicit choice, or drops it.
 *
 * Older versions cached the detected language on the first visit, so a cached value does not
 * say whether someone picked it. A value equal to what that version detects from this browser is
 * taken as detected and dropped: the language is detected again, with the current languages
 * (`en` on a British browser becomes English (UK)). Any other value can only come from the
 * selector (`en` on a French browser) and is kept. Someone who picked `en` on a British browser
 * gets English (UK) once, until they pick English (US) again.
 */
export function migrateLegacyLanguage(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY);
    if (legacy === null) return;
    localStorage.removeItem(LEGACY_LANGUAGE_STORAGE_KEY);
    const wasDetected = getBaseLanguage(legacy) === legacyDetectedLanguage();
    // A choice made with this version wins over the one of an older version.
    if (!wasDetected && localStorage.getItem(LANGUAGE_STORAGE_KEY) === null) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, legacy);
    }
  } catch {
    // Site data blocked: nothing was cached either.
  }
}
