import { describe, it, expect } from 'vitest';
import { IdParams, NullableDate, OptionalIntQuery, Percent, RequiredText, Translations } from './common';

describe('IdParams', () => {
  it('coerces a numeric path segment', () => {
    expect(IdParams.parse({ id: '42' })).toEqual({ id: 42 });
  });

  it.each(['abc', '0', '-1', '1.5'])('rejects %s', (id) => {
    expect(IdParams.safeParse({ id }).success).toBe(false);
  });
});

describe('OptionalIntQuery', () => {
  it('accepts a missing value and coerces a number', () => {
    expect(OptionalIntQuery.parse(undefined)).toBeUndefined();
    expect(OptionalIntQuery.parse('7')).toBe(7);
  });

  it('rejects a non-numeric value', () => {
    expect(OptionalIntQuery.safeParse('x').success).toBe(false);
  });
});

describe('Percent', () => {
  it('accepts the bounds 0 and 100', () => {
    expect(Percent.parse(0)).toBe(0);
    expect(Percent.parse(100)).toBe(100);
  });

  it.each([-1, 101, 50.5, '50'])('rejects %s', (value) => {
    expect(Percent.safeParse(value).success).toBe(false);
  });
});

describe('RequiredText', () => {
  it('trims the text and rejects a blank one', () => {
    expect(RequiredText.parse('  Rum ')).toBe('Rum');
    expect(RequiredText.safeParse('   ').success).toBe(false);
  });
});

describe('Translations', () => {
  it('accepts one language only, and null', () => {
    expect(Translations.parse({ fr: ' Rhum ' })).toEqual({ fr: 'Rhum' });
    expect(Translations.parse(null)).toBeNull();
  });

  it('rejects an unknown language and a non-string value', () => {
    expect(Translations.safeParse({ de: 'Rum' }).success).toBe(false);
    expect(Translations.safeParse({ fr: 42 }).success).toBe(false);
  });
});

describe('NullableDate', () => {
  it('reads a date input value and a full ISO timestamp', () => {
    expect(NullableDate.parse('2026-10-11')).toEqual(new Date('2026-10-11'));
    expect(NullableDate.parse('2026-10-11T08:30:00.000Z')).toEqual(new Date('2026-10-11T08:30:00.000Z'));
  });

  it('turns null and an empty string into null', () => {
    expect(NullableDate.parse(null)).toBeNull();
    expect(NullableDate.parse('')).toBeNull();
  });

  it('rejects a string that is not a date', () => {
    expect(NullableDate.safeParse('yesterday').success).toBe(false);
  });
});
