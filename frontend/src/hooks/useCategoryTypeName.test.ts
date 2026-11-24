import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { buildCategoryType } from '../test/factories';
import { useCategoryTypeName } from './useCategoryTypeName';

// The test mock of i18next renders keys, in English.
const WITH_SPACES = 'categoryTypes.withSpaces';
const EMPTY_NAME = 'categoryTypes.emptyName';

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
