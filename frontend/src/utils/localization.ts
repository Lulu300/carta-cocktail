/**
 * Get the localized name for an entity with nameTranslations.
 * Fallback chain: currentLocale -> "en" -> any available -> entity.name
 */
export function getLocalizedName(
  entity: { name: string; nameTranslations?: Record<string, string> | null },
  locale: string
): string {
  const t = entity.nameTranslations;
  if (!t || typeof t !== 'object') return entity.name;
  return t[locale] || t['en'] || Object.values(t).find(v => v) || entity.name;
}
