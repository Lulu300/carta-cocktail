/** Language used when the requested one is not available (also i18next's fallbackLng). */
export const FALLBACK_LANGUAGE = 'en';

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
