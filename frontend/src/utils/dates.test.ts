import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datePattern, formatDate, isoDatePattern, parseDateInput } from './dates';

const FRENCH_LETTERS: Record<string, string> = { 'dates.day': 'jj', 'dates.month': 'mm', 'dates.year': 'aaaa' };
const ENGLISH_LETTERS: Record<string, string> = { 'dates.day': 'dd', 'dates.month': 'mm', 'dates.year': 'yyyy' };
const french = (key: string) => FRENCH_LETTERS[key];
const english = (key: string) => ENGLISH_LETTERS[key];

describe('formatDate', () => {
  // West of UTC, a midnight-UTC date read in local time is the day before. Pinned here because
  // CI runs in UTC, where reading local time would go unnoticed.
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs west of UTC', () => {
    expect(new Date('2024-12-03T00:00:00.000Z').getDate()).toBe(2);
  });

  it('writes the day first in French', () => {
    expect(formatDate('2024-12-03', 'fr')).toBe('03/12/2024');
  });

  it('writes the month first in US English, with a four-digit year', () => {
    expect(formatDate('2024-12-03', 'en')).toBe('12/03/2024');
  });

  it('keeps the stored day of a midnight UTC timestamp, whatever the time zone', () => {
    expect(formatDate('2024-12-03T00:00:00.000Z', 'fr')).toBe('03/12/2024');
  });

  it('shows a timestamp with an offset on its UTC day', () => {
    expect(formatDate('2024-03-12T23:30:00-05:00', 'en')).toBe('03/13/2024');
  });

  it('uses the base language of a regional code, then English', () => {
    expect(formatDate('2024-12-03', 'fr-CA')).toBe('03/12/2024');
    expect(formatDate('2024-12-03', 'de')).toBe('12/03/2024');
  });

  it('gives an empty text for no date or an invalid one', () => {
    expect(formatDate('', 'fr')).toBe('');
    expect(formatDate('not a date', 'fr')).toBe('');
  });
});

describe('parseDateInput', () => {
  it('reads a French date day first', () => {
    expect(parseDateInput('03/12/2024', 'fr')).toBe('2024-12-03');
  });

  it('reads an English date month first', () => {
    expect(parseDateInput('12/03/2024', 'en')).toBe('2024-12-03');
  });

  it('accepts a one-digit day and month and surrounding spaces', () => {
    expect(parseDateInput(' 3/1/2024 ', 'fr')).toBe('2024-01-03');
  });

  it('accepts February 29 of a leap year only', () => {
    expect(parseDateInput('29/02/2024', 'fr')).toBe('2024-02-29');
    expect(parseDateInput('29/02/2023', 'fr')).toBeNull();
    expect(parseDateInput('29/02/1900', 'fr')).toBeNull();
    expect(parseDateInput('29/02/2000', 'fr')).toBe('2000-02-29');
  });

  it.each([
    ['31/02/2024', 'fr', 'a day the month does not have'],
    ['31/04/2024', 'fr', 'April 31'],
    ['03/13/2024', 'fr', 'a thirteenth month'],
    ['00/12/2024', 'fr', 'day zero'],
    ['13/03/2024', 'en', 'a thirteenth month in English'],
    ['abc', 'fr', 'text'],
    ['', 'fr', 'an empty text'],
    ['03/12/24', 'fr', 'a two-digit year'],
    ['03.12.2024', 'fr', 'another separator'],
    ['2024-12-03', 'fr', 'an ISO date'],
    ['03/12/2024/1', 'fr', 'an extra field'],
    ['003/12/2024', 'fr', 'a three-digit day'],
  ])('refuses %s in %s (%s)', (text, language) => {
    expect(parseDateInput(text, language)).toBeNull();
  });

  it('reads back what formatDate writes', () => {
    for (const language of ['fr', 'en']) {
      expect(parseDateInput(formatDate('2026-10-11', language), language)).toBe('2026-10-11');
    }
  });
});

describe('datePattern', () => {
  it('orders the translated letters as the language writes a date', () => {
    expect(datePattern('fr', french)).toBe('jj/mm/aaaa');
    expect(datePattern('en', english)).toBe('mm/dd/yyyy');
  });

  it('falls back to the English order for a language without a format', () => {
    expect(datePattern('de', english)).toBe('mm/dd/yyyy');
  });
});

describe('isoDatePattern', () => {
  it('writes the year first in every language', () => {
    expect(isoDatePattern(french)).toBe('aaaa-mm-jj');
    expect(isoDatePattern(english)).toBe('yyyy-mm-dd');
  });
});
