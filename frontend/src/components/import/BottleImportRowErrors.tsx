import { useTranslation } from 'react-i18next';
import type { BottleImportRowError } from '../../types';

// Codes and sources this version can name. A newer backend may send others:
// they get a generic reason, or the raw source, rather than an i18n key.
const KNOWN_CODES: readonly string[] = ['required', 'outOfRange', 'invalidDate', 'invalidNumber'];
const KNOWN_SOURCES: readonly string[] = ['bottles', 'categories'];

/** Rows of the file the backend left out, with the line and the reason. */
export default function BottleImportRowErrors({ errors }: { errors: BottleImportRowError[] }) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;

  const sourceLabel = (source: string) =>
    KNOWN_SOURCES.includes(source) ? t(`bottles.importWizard.rowErrors.source.${source}`) : source;
  const reasonKey = (code: string) =>
    `bottles.importWizard.rowErrors.code.${KNOWN_CODES.includes(code) ? code : 'unknown'}`;

  return (
    <section role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm space-y-2">
      <p className="font-semibold">{t('bottles.importWizard.rowErrors.title', { count: errors.length })}</p>
      <ul className="space-y-1 text-xs">
        {errors.map((error) => (
          <li key={`${error.source}-${error.line}`}>
            <span className="font-medium">
              {t('bottles.importWizard.rowErrors.position', { source: sourceLabel(error.source), line: error.line })}
            </span>{' '}
            <span>{t(reasonKey(error.code), { field: error.field })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
