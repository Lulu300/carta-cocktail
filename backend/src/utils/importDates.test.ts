import { describe, it, expect } from 'vitest';
import { parseImportDate } from './importDates';

const LANGUAGES = ['fr', 'en'];

describe('parseImportDate', () => {
  describe.each(LANGUAGES)('in %s', (language) => {
    it.each([
      ['2024-03-12', '2024-03-12'],
      ['2024-02-29', '2024-02-29'],
      [' 2024-03-12 ', '2024-03-12'],
      ['2024-03-12T00:00:00.000Z', '2024-03-12T00:00:00.000Z'],
      ['2024-03-12T10:30Z', '2024-03-12T10:30Z'],
      ['2024-03-12T10:30:00+01:00', '2024-03-12T10:30:00+01:00'],
    ])('reads the ISO date %j as %j', (text, expected) => {
      expect(parseImportDate(text, language)).toBe(expected);
    });

    it.each([
      '31/02/2024',
      '29/02/2023',
      '13/13/2024',
      '0/03/2024',
      '2024',
      'March 2024',
      '12 March 2024',
      '12-03-24',
      '12-03-2024',
      '12/03/24',
      '12 03 2024',
      '12/03.2024',
      '2024-02-30',
      '2024-13-01',
      '2024-03-12T10:30',
      '2024-03-12T25:00:00Z',
      '2024-02-30T00:00:00.000Z',
      '',
      'soon',
    ])('refuses %j', (text) => {
      expect(parseImportDate(text, language)).toBeNull();
    });
  });

  describe('in fr: day/month/year', () => {
    it.each([
      ['12/03/2024', '2024-03-12'],
      ['12.03.2024', '2024-03-12'],
      ['25/03/2024', '2024-03-25'],
      ['1/3/2024', '2024-03-01'],
      ['29/02/2000', '2000-02-29'],
    ])('reads %j as %j', (text, expected) => {
      expect(parseImportDate(text, 'fr')).toBe(expected);
    });

    it('refuses a month above 12', () => {
      expect(parseImportDate('03/25/2024', 'fr')).toBeNull();
    });

    it('refuses February 29 of a century that is not a leap year', () => {
      expect(parseImportDate('29/02/1900', 'fr')).toBeNull();
    });
  });

  describe('in en: month/day/year (US English)', () => {
    it.each([
      ['12/03/2024', '2024-12-03'],
      ['12.03.2024', '2024-12-03'],
      ['3/25/2024', '2024-03-25'],
    ])('reads %j as %j', (text, expected) => {
      expect(parseImportDate(text, 'en')).toBe(expected);
    });

    it('refuses a month above 12', () => {
      expect(parseImportDate('25/03/2024', 'en')).toBeNull();
    });
  });

  describe('language lookup', () => {
    it.each([
      ['fr-FR', '2024-03-12'],
      ['fr-CA', '2024-03-12'],
      ['en-US', '2024-12-03'],
    ])('reads a regional code (%s) with its base language', (language, expected) => {
      expect(parseImportDate('12/03/2024', language)).toBe(expected);
    });

    it.each(['de', 'constructor', ''])('reads an unknown language (%j) as en, the fallback language', (language) => {
      expect(parseImportDate('12/03/2024', language)).toBe('2024-12-03');
    });
  });
});
