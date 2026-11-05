/** Language used when the requested one is not available (also i18next's fallbackLng). */
export const FALLBACK_LANGUAGE = 'en';

// Language names are endonyms: each one is written in its own language and never translated.

/**
 * Name of each language entity names are translated into (`nameTranslations`). These are keyed by
 * base language: `en` serves US and UK English alike, so its field is just "English".
 */
export const CONTENT_LANGUAGE_NAMES = {
  fr: 'Français',
  en: 'English',
} as const;

/** Name of each language of the app, as the language selector lists them. */
export const LANGUAGE_NAMES = {
  fr: CONTENT_LANGUAGE_NAMES.fr,
  en: 'English (US)',
  'en-GB': 'English (UK)',
} as const;

/**
 * Reduce a BCP 47 locale (e.g. "fr-FR") to its base language code ("fr").
 */
export function getBaseLanguage(locale: string): string {
  return locale.split('-')[0];
}

/**
 * Get the localized name for an entity with nameTranslations.
 * Fallback chain: locale -> base language -> fallback language -> any available -> entity.name
 */
export function getLocalizedName(
  entity: { name: string; nameTranslations?: Record<string, string> | null },
  locale: string
): string {
  const t = entity.nameTranslations;
  if (!t || typeof t !== 'object') return entity.name;
  // Browsers report regional locales ("fr-FR") while translations are keyed by base language.
  return (
    t[locale] ||
    t[getBaseLanguage(locale)] ||
    t[FALLBACK_LANGUAGE] ||
    Object.values(t).find(v => v) ||
    entity.name
  );
}
