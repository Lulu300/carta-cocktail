/** Stored translations of an entity name, keyed by language. */
export type NameTranslations = Record<string, string> | null | undefined;

/** The translated names an admin form edits, one field per supported language. */
export interface TranslationForm {
  fr: string;
  en: string;
}

export function toTranslationForm(nameTranslations: NameTranslations): TranslationForm {
  return {
    fr: nameTranslations?.fr ?? '',
    en: nameTranslations?.en ?? '',
  };
}

/**
 * The value sent to the API: blank languages are left out, and no translation
 * at all is null, so the entity falls back to its base name.
 */
export function buildNameTranslations(form: TranslationForm): Record<string, string> | null {
  const translations: Record<string, string> = {};
  for (const [language, value] of Object.entries(form)) {
    const trimmed = value.trim();
    if (trimmed) translations[language] = trimmed;
  }
  return Object.keys(translations).length > 0 ? translations : null;
}
