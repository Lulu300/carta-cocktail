/**
 * Dates shown to and typed by the admin, in the format of the app's language (not the browser's).
 * The API and the forms keep ISO dates (`yyyy-mm-dd`); only what the admin reads and types changes.
 */

import { FALLBACK_LANGUAGE, getBaseLanguage } from './localization';

type DateField = 'day' | 'month' | 'year';

interface DateFormat {
  /** The fields in the order the language writes them. */
  order: readonly [DateField, DateField, DateField];
  separator: string;
}

/**
 * One entry per language; a new language (or regional variant) adds its format here, with a test.
 * `en` is US English: `12/03/2024` is December 3, as the import reads it (backend `importDates.ts`).
 * `en-GB` writes the day first: `12/03/2024` is March 12.
 * A Map, not an object: `constructor` is no language.
 */
const DATE_FORMATS = new Map<string, DateFormat>([
  ['en', { order: ['month', 'day', 'year'], separator: '/' }],
  ['en-GB', { order: ['day', 'month', 'year'], separator: '/' }],
  ['fr', { order: ['day', 'month', 'year'], separator: '/' }],
]);

/** Translates a message key: the `t` of `useTranslation()`. */
type Translate = (key: string) => string;

/** Letters standing for each field in a template: `jj`/`mm`/`aaaa` in French. */
const FIELD_LETTER_KEYS: Record<DateField, string> = {
  day: 'dates.day',
  month: 'dates.month',
  year: 'dates.year',
};

/** The exact code first (`en-GB`), then its base language (`en`), then the app's fallback language. */
function dateFormat(language: string): DateFormat {
  return DATE_FORMATS.get(language)
    ?? DATE_FORMATS.get(getBaseLanguage(language))
    ?? DATE_FORMATS.get(FALLBACK_LANGUAGE)!;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `Date` would roll 31/02 over to March: the day is checked against the month. */
function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= lastDay;
}

/**
 * A date of the API (`yyyy-mm-dd` or an ISO timestamp) in the language's format, with a
 * four-digit year (`Intl`'s short style writes `3/12/24` in English). Empty when it is no date.
 */
export function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  // Dates are stored at midnight UTC: the local day would be the day before west of UTC.
  const fields: Record<DateField, string> = {
    day: pad(date.getUTCDate(), 2),
    month: pad(date.getUTCMonth() + 1, 2),
    year: pad(date.getUTCFullYear(), 4),
  };
  const { order, separator } = dateFormat(language);
  return order.map((field) => fields[field]).join(separator);
}

/**
 * A date typed in the language's format, as `yyyy-mm-dd`. The day and the month may have one
 * digit, the year needs four (`12/03/24` could be 1924 or 2024). `null` when the text is in
 * another format or names a day that does not exist (`31/02/2024`).
 */
export function parseDateInput(text: string, language: string): string | null {
  const { order, separator } = dateFormat(language);
  const parts = text.trim().split(separator);
  if (parts.length !== order.length) return null;

  const fields: Partial<Record<DateField, number>> = {};
  for (const [index, field] of order.entries()) {
    const digits = field === 'year' ? /^\d{4}$/ : /^\d{1,2}$/;
    if (!digits.test(parts[index])) return null;
    fields[field] = Number(parts[index]);
  }

  const { year, month, day } = fields as Record<DateField, number>;
  if (!isCalendarDate(year, month, day)) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The template shown to the admin, with translated field letters: `jj/mm/aaaa`, `mm/dd/yyyy`. */
export function datePattern(language: string, t: Translate): string {
  const { order, separator } = dateFormat(language);
  return order.map((field) => t(FIELD_LETTER_KEYS[field])).join(separator);
}

/** The ISO template, accepted by the import in every language: `aaaa-mm-jj`, `yyyy-mm-dd`. */
export function isoDatePattern(t: Translate): string {
  const isoOrder: DateField[] = ['year', 'month', 'day'];
  return isoOrder.map((field) => t(FIELD_LETTER_KEYS[field])).join('-');
}
