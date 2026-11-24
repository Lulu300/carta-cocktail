import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { buildCategoryType } from '../test/factories';
import { useCategoryTypeName } from './useCategoryTypeName';

// The test mock of i18next renders keys, in English.
const WITH_SPACES = 'categoryTypes.withSpaces';
const EMPTY_NAME = 'categoryTypes.emptyName';
const WITH_INVISIBLE = 'categoryTypes.withInvisibleCharacters';

function renderNames() {
  return renderHook(() => useCategoryTypeName()).result.current;
}

describe('useCategoryTypeName', () => {
  describe('visibleName', () => {
    it('keeps a name HTML shows as it is', () => {
      const { visibleName } = renderNames();
      expect(['SPIRIT', 'X Y', '.', '..'].map(visibleName)).toEqual(['SPIRIT', 'X Y', '.', '..']);
    });

    it('labels the empty name', () => {
      expect(renderNames().visibleName('')).toBe(EMPTY_NAME);
    });

    it('shows and announces the spaces HTML would hide: around, repeated inside, or not a plain space', () => {
      const { visibleName } = renderNames();
      expect(visibleName(' SPIRIT ')).toBe(`␣SPIRIT␣ ${WITH_SPACES}`);
      expect(visibleName('X  Y')).toBe(`X␣␣Y ${WITH_SPACES}`);
      expect(visibleName('X\tY')).toBe(`X␣Y ${WITH_SPACES}`);
      expect(visibleName('   ')).toBe(`␣␣␣ ${WITH_SPACES}`);
    });

    it('shows each character HTML draws as nothing by its code point, and announces them', () => {
      const { visibleName } = renderNames();
      expect(visibleName('X\u200BY')).toBe(`X[U+200B]Y ${WITH_INVISIBLE}`);
      expect(visibleName('\u202ERUM\u00AD')).toBe(`[U+202E]RUM[U+00AD] ${WITH_INVISIBLE}`);
      expect(visibleName('\u2060')).toBe(`[U+2060] ${WITH_INVISIBLE}`);
    });

    // JS counts a byte order mark as white space, but HTML draws nothing for it, not a space
    it('shows a byte order mark by its code point, not as a space', () => {
      expect(renderNames().visibleName('X\uFEFFY')).toBe(`X[U+FEFF]Y ${WITH_INVISIBLE}`);
    });

    it('shows the characters fonts draw as a blank as spaces', () => {
      const { visibleName } = renderNames();
      expect(visibleName('X\u2800Y')).toBe(`X␣Y ${WITH_SPACES}`);
      expect(visibleName('\u3164SPIRIT\uFFA0')).toBe(`␣SPIRIT␣ ${WITH_SPACES}`);
    });

    it('marks a joiner between letters of a script that does not join', () => {
      expect(renderNames().visibleName('梅\u200D酒')).toBe(`梅[U+200D]酒 ${WITH_INVISIBLE}`);
    });

    it('announces both hidden spaces and invisible characters', () => {
      expect(renderNames().visibleName(' X\u200BY')).toBe(`␣X[U+200B]Y ${WITH_SPACES} ${WITH_INVISIBLE}`);
    });

    it('keeps the joiners and variation selectors that change how a name is drawn', () => {
      const { visibleName } = renderNames();
      const names = ['CRÈME', 'می\u200Cخواهم', 'क\u094D\u200Dष', 'ന\u0D4D\u200D', '👩\u200D💻', '❤\uFE0F'];
      expect(names.map(visibleName)).toEqual(names);
    });
  });

  describe('localizedName', () => {
    it('marks the stored name, never a translation', () => {
      const { localizedName } = renderNames();
      expect(localizedName(buildCategoryType({ name: ' SPIRIT ' }))).toBe(`␣SPIRIT␣ ${WITH_SPACES}`);
      expect(localizedName(buildCategoryType({ name: 'SPIRIT', nameTranslations: { en: 'Spi  rits' } }))).toBe('Spi  rits');
    });
  });

  describe('typeLabel', () => {
    it('adds the marked stored name to the translation of a type whose name HTML would hide', () => {
      const { typeLabel } = renderNames();
      const nameTranslations = { en: 'Spirits' };
      expect(typeLabel(buildCategoryType({ name: ' SPIRIT ', nameTranslations }))).toBe(`Spirits – ␣SPIRIT␣ ${WITH_SPACES}`);
      expect(typeLabel(buildCategoryType({ name: '', nameTranslations }))).toBe(`Spirits – ${EMPTY_NAME}`);
      expect(typeLabel(buildCategoryType({ name: 'SPIRIT', nameTranslations }))).toBe('Spirits');
    });

    it('adds the marked stored name to the translation of a type with an invisible character', () => {
      const type = buildCategoryType({ name: 'X\u200BY', nameTranslations: { en: 'Mixers' } });
      expect(renderNames().typeLabel(type)).toBe(`Mixers – X[U+200B]Y ${WITH_INVISIBLE}`);
    });

    it('shows an untranslated type by its stored name, marked once', () => {
      expect(renderNames().typeLabel(buildCategoryType({ name: 'X  Y' }))).toBe(`X␣␣Y ${WITH_SPACES}`);
    });
  });

  describe('categoryTypeLabel', () => {
    it('labels a known type like typeLabel', () => {
      const spacedSpirit = buildCategoryType({ name: ' SPIRIT ', nameTranslations: { en: 'Spirits' } });
      expect(renderNames().categoryTypeLabel(' SPIRIT ', spacedSpirit)).toBe(`Spirits – ␣SPIRIT␣ ${WITH_SPACES}`);
    });

    it('marks the stored name when the type is not known', () => {
      const { categoryTypeLabel } = renderNames();
      expect(categoryTypeLabel(' SPIRIT ', null)).toBe(`␣SPIRIT␣ ${WITH_SPACES}`);
      expect(categoryTypeLabel('', undefined)).toBe(EMPTY_NAME);
      expect(categoryTypeLabel('SPIRIT', null)).toBe('SPIRIT');
    });
  });
});
