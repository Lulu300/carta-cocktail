import { useTranslation } from 'react-i18next';
import type { BottleImportRowError, BottleImportRowWarning } from '../../types';
import { datePattern, isoDatePattern } from '../../utils/dates';
import Alert from '../ui/Alert';

// Codes and sources this version can name. A newer backend may send others:
// they get a generic reason, or the raw source, rather than an i18n key.
const KNOWN_ERROR_CODES: readonly string[] = ['required', 'outOfRange', 'invalidDate', 'invalidNumber', 'malformedQuotes'];
const KNOWN_WARNING_CODES: readonly string[] = ['lineBreak'];
const KNOWN_SOURCES: readonly string[] = ['bottles', 'categories'];

/** A row error or warning: the code is any string, a newer backend may send codes this version cannot name. */
interface RowIssue {
  source: string;
  line: number;
  field: string;
  column?: number;
  code: string;
}

// A warning is not an alert: the rows are imported, nothing interrupts the admin
const TONES = { error: 'danger', warning: 'warning' } as const;

interface RowIssuesProps {
  issues: RowIssue[];
  tone: keyof typeof TONES;
  title: string;
  hint?: string;
  reason: (issue: RowIssue, field: string) => string;
}

/** Rows of the file located by source and line, each with its field and reason. */
function RowIssues({ issues, tone, title, hint, reason }: RowIssuesProps) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;

  const sourceLabel = (source: string) =>
    KNOWN_SOURCES.includes(source) ? t(`bottles.importWizard.rowErrors.source.${source}`) : source;
  // A cell past the last named column has no name: its number stands for it
  const fieldLabel = ({ field, column }: RowIssue) => {
    if (field || column === undefined) return field;
    return t('bottles.importWizard.rowErrors.column', { number: column });
  };

  return (
    <Alert tone={TONES[tone]} title={title}>
      {hint && <p className="text-xs">{hint}</p>}
      <ul className="space-y-1 text-xs">
        {issues.map((issue) => (
          <li key={`${issue.source}-${issue.line}-${issue.field}-${issue.column ?? ''}`}>
            <span className="font-medium">
              {t('bottles.importWizard.rowErrors.position', { source: sourceLabel(issue.source), line: issue.line })}
            </span>{' '}
            <span>{reason(issue, fieldLabel(issue))}</span>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/** Rows of the file the backend left out, with the line and the reason. */
export default function BottleImportRowErrors({ errors }: { errors: BottleImportRowError[] }) {
  const { t, i18n } = useTranslation();

  // The formats the import reads, for an invalid date: the language's, or ISO 8601.
  const dateFormats = { pattern: datePattern(i18n.language, t), isoPattern: isoDatePattern(t) };
  const reasonKey = (code: string) =>
    `bottles.importWizard.rowErrors.code.${KNOWN_ERROR_CODES.includes(code) ? code : 'unknown'}`;

  return (
    <RowIssues
      issues={errors}
      tone="error"
      title={t('bottles.importWizard.rowErrors.title', { count: errors.length })}
      reason={(error, field) => t(reasonKey(error.code), { field, ...dateFormats })}
    />
  );
}

/**
 * Values the import keeps as they are but the admin should check, such as a name on several
 * lines: a quote the file misplaces can merge the lines after it into one value. Not blocking.
 */
export function BottleImportRowWarnings({ warnings }: { warnings: BottleImportRowWarning[] }) {
  const { t } = useTranslation();
  const reasonKey = (code: string) =>
    `bottles.importWizard.rowWarnings.code.${KNOWN_WARNING_CODES.includes(code) ? code : 'unknown'}`;

  return (
    <RowIssues
      issues={warnings}
      tone="warning"
      title={t('bottles.importWizard.rowWarnings.title', { count: warnings.length })}
      hint={t('bottles.importWizard.rowWarnings.hint')}
      reason={(warning, field) => t(reasonKey(warning.code), { field })}
    />
  );
}
