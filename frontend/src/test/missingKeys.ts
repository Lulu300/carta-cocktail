import i18n from '../i18n';

const missingKeys: string[] = [];

/**
 * Makes i18next report the keys it finds in no bundle, instead of silently showing the key:
 * setup.ts turns them into a failure after the test that displayed them.
 */
export function collectMissingKeys() {
  i18n.options.saveMissing = true;
  i18n.options.missingKeyHandler = (_languages, _namespace, key) => {
    missingKeys.push(key);
  };
}

/** The keys reported since the last call, without duplicates. */
export function takeMissingKeys(): string[] {
  return [...new Set(missingKeys.splice(0))];
}
