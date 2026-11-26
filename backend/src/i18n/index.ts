import i18next from 'i18next';
import middleware from 'i18next-http-middleware';
import en from './en.json';
import fr from './fr.json';

/** Language used when the request's language has no translation (also read by the import's date formats). */
export const FALLBACK_LANGUAGE = 'en';

/**
 * The languages a request can get, the frontend's own list. `en-GB` has no messages of its own
 * (it gets those of `en`): it only changes how the import reads dates.
 */
const SUPPORTED_LANGUAGES: readonly string[] = ['en', 'en-GB', 'fr'];

/**
 * A detected code as one of SUPPORTED_LANGUAGES: kept when it is one ("en-gb" -> "en-GB"),
 * reduced to its base language otherwise ("fr-FR" -> "fr"), and an empty string, which the
 * middleware skips, when it has none ("de"). Done before i18next matches the codes because
 * its first pass takes any exact match: `fr-CA, en;q=0.5` would get English. And a language
 * nobody can be served then never reaches the shared instance's caches.
 */
function toSupportedLanguage(code: string): string {
  const lowerCaseCode = code.toLowerCase();
  const exactMatch = SUPPORTED_LANGUAGES.find(
    (language) => language.toLowerCase() === lowerCaseCode,
  );
  if (exactMatch) return exactMatch;
  const baseLanguage = lowerCaseCode.split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(baseLanguage) ? baseLanguage : '';
}

i18next.use(middleware.LanguageDetector).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  // The converter is what limits a request to SUPPORTED_LANGUAGES, even an unauthenticated one
  // with a made-up language: i18next keeps state per language, and formats the numbers of a
  // message in its language (`de` would get English text with `5.000`).
  detection: { convertDetectedLanguage: toSupportedLanguage },
  // Second guard, for a language that does not come through the detector: a `changeLanguage()`
  // or a `req.lng` set by code, or a converter changed by mistake. Also the frontend's setting.
  supportedLngs: [...SUPPORTED_LANGUAGES],
  fallbackLng: FALLBACK_LANGUAGE,
  preload: ['en', 'fr'],
  // Messages go out as JSON and the frontend renders them as text: HTML-escaping
  // the interpolated values would show `&amp;` instead of `&`.
  interpolation: { escapeValue: false },
});

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
