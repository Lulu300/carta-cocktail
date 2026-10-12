/**
 * Dates read from an imported file. ISO 8601, the format of the export, is read in any language.
 * A date typed in a spreadsheet (`12/03/2024`, `12.03.2024`) is read in the order of the
 * admin's language. Nothing else is accepted: `Date.parse` reads vague text (`2024`, `March 2024`)
 * in a way that depends on the JavaScript engine, and reads `12/03/2024` as US English everywhere.
 */

import { FALLBACK_LANGUAGE } from '../i18n';

/** Order of the day and the month in a date written with slashes or dots. */
type DayMonthOrder = 'dayFirst' | 'monthFirst';


/**
 * One entry per application language; a new language adds its order here, with a test.
 * `en` is US English, as Excel in English (US) writes it: `3/12/2024` is March 12.
 * A Map, not an object: the language comes from a request header (`constructor` is no language).
 */
const DAY_MONTH_ORDERS = new Map<string, DayMonthOrder>([
  ['en', 'monthFirst'],
  ['fr', 'dayFirst'],
]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// The export writes `toISOString()`. The offset is required: a time without one would be read
// in the server's time zone.
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
// A four-digit year: `12/03/24` could be 1924 or 2024
const NUMERIC_DATE = /^(\d{1,2})([/.])(\d{1,2})\2(\d{4})$/;

/** The exact code first (`en-GB`), then its base language (`en`), then the app's fallback language. */
function dayMonthOrder(language: string): DayMonthOrder {
  const baseLanguage = language.split('-')[0].toLowerCase();
  return DAY_MONTH_ORDERS.get(language)
    ?? DAY_MONTH_ORDERS.get(baseLanguage)
    ?? DAY_MONTH_ORDERS.get(FALLBACK_LANGUAGE)!;
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

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isCalendarDate(year, month, day)) return null;
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  // A short year (`204`) would not be ISO: the confirmation would read it in the server's time zone
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function readIsoDate(text: string): string | null {
  const match = ISO_DATE.exec(text);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return toIsoDate(year, month, day);
}

function readIsoTimestamp(text: string): string | null {
  const match = ISO_TIMESTAMP.exec(text);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  // Date.parse refuses a time out of range (25:00)
  return isCalendarDate(year, month, day) && !Number.isNaN(Date.parse(text)) ? text : null;
}

function readNumericDate(text: string, language: string): string | null {
  const match = NUMERIC_DATE.exec(text);
  if (!match) return null;
  const [first, second, year] = [Number(match[1]), Number(match[3]), Number(match[4])];
  return dayMonthOrder(language) === 'dayFirst'
    ? toIsoDate(year, second, first)
    : toIsoDate(year, first, second);
}

/**
 * The date of an import cell: `yyyy-mm-dd`, or an ISO timestamp kept as written.
 * `null` when the text is in no accepted format or names a day that does not exist.
 */
export function parseImportDate(text: string, language: string): string | null {
  const value = text.trim();
  return readIsoDate(value) ?? readIsoTimestamp(value) ?? readNumericDate(value, language);
}
