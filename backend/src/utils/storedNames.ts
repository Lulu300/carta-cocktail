import { composeName } from './invisibleCharacters';
import { parseTranslations, TranslationsInput } from './translations';

/**
 * A category, unit, ingredient or category type name the admin sent, as it is stored: in the
 * composed form (NFC), so that a name pasted with decomposed accents (often from macOS file
 * names) is stored like the same name typed. A value sent exactly as `stored` is kept as it is:
 * the forms send every field, and a name stored before this rule (C-65) does not change until the
 * admin changes it.
 */
export function nameToStore(sent: string, stored?: string | null): string {
  return sent === stored ? sent : composeName(sent);
}

/**
 * The translated names the admin sent, each one as `nameToStore` stores it, against the translation
 * of the same language in `stored` (the `nameTranslations` column). `undefined` (field absent) and
 * `null` (translations cleared) are passed through for `serializeTranslations`.
 */
export function translationsToStore(sent: TranslationsInput | undefined, stored?: string | null): TranslationsInput | undefined {
  if (!sent) return sent;
  const storedTranslations = parseTranslations(stored);
  return Object.fromEntries(
    Object.entries(sent).map(([language, text]) => [language, text && nameToStore(text, storedTranslations?.[language])]),
  );
}
