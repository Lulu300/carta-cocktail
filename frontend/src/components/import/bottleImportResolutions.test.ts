import { describe, it, expect } from 'vitest';
import { buildCategory } from '../../test/factories';
import type { BottleCategoryPreview, BottleImportPreviewResponse, BottleImportResolutions } from '../../types';
import {
  buildAutoCategoryResolutions,
  countCategoriesToCreate,
  countCategoriesToResolve,
  defaultCategoryData,
  existingCategoryFor,
} from './bottleImportResolutions';

// Data older than C-07 can hold two categories that differ only by case
const rhum = buildCategory({ id: 1, name: 'Rhum' });
const upperRhum = buildCategory({ id: 2, name: 'RHUM' });
const gin = buildCategory({ id: 3, name: 'Gin' });
const existing = [rhum, upperRhum, gin];

function categoryRef(name: string) {
  return { name, type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null };
}

function previewOf(categories: BottleCategoryPreview[]): BottleImportPreviewResponse {
  return { payload: { version: 1, categories: categories.map((entry) => entry.ref), bottles: [] }, categories, bottles: [], errors: [] };
}

const ambiguousRhum: BottleCategoryPreview = {
  ref: categoryRef('rhum'),
  existingMatch: null,
  status: 'ambiguous',
  ambiguousMatches: [{ id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, { id: 2, name: 'RHUM', type: 'SPIRIT', desiredStock: 1 }],
};
const matchedGin: BottleCategoryPreview = {
  ref: categoryRef('Gin'),
  existingMatch: { id: 3, name: 'Gin', type: 'SPIRIT', desiredStock: 1 },
  status: 'matched',
};
const missingVodka: BottleCategoryPreview = { ref: categoryRef('Vodka'), existingMatch: null, status: 'missing' };

function creating(name: string) {
  return { action: 'create' as const, data: { ...defaultCategoryData(categoryRef(name)), name } };
}

describe('buildAutoCategoryResolutions', () => {
  it('uses the match, creates the missing category, and leaves an ambiguous one for the admin', () => {
    expect(buildAutoCategoryResolutions(previewOf([ambiguousRhum, matchedGin, missingVodka]))).toEqual({
      gin: { action: 'use_existing', existingId: 3 },
      vodka: { action: 'create', data: defaultCategoryData(missingVodka.ref) },
    });
  });
});

describe('existingCategoryFor', () => {
  it('compares the trimmed name, or the file name the resolution key holds when it is blank', () => {
    expect(existingCategoryFor('vodka', creating(' gin '), existing)).toEqual({ status: 'found', row: gin });
    expect(existingCategoryFor('rhum', creating('  '), existing)).toEqual({ status: 'ambiguous', rows: [rhum, upperRhum] });
    expect(existingCategoryFor('rhum', creating('Rhum blanc'), existing)).toEqual({ status: 'none' });
  });
});

describe('countCategoriesToResolve', () => {
  const preview = previewOf([ambiguousRhum, matchedGin]);
  const resolve = (rhumResolution?: BottleImportResolutions['categories'][string]): BottleImportResolutions => ({
    categories: { gin: { action: 'use_existing', existingId: 3 }, ...(rhumResolution && { rhum: rhumResolution }) },
    bottles: {},
  });

  it('counts an ambiguous category until one of its matches is picked', () => {
    expect(countCategoriesToResolve(preview, resolve(), existing)).toBe(1);
    expect(countCategoriesToResolve(preview, resolve({ action: 'use_existing' }), existing)).toBe(1);
    expect(countCategoriesToResolve(preview, resolve({ action: 'use_existing', existingId: 2 }), existing)).toBe(0);
  });

  it('counts a category to create under a name several categories hold ignoring case', () => {
    expect(countCategoriesToResolve(preview, resolve(creating('rhum')), existing)).toBe(1);
    expect(countCategoriesToResolve(preview, resolve(creating('Rhum')), existing)).toBe(0);
    expect(countCategoriesToResolve(preview, resolve(creating('Rhum blanc')), existing)).toBe(0);
  });
});

describe('countCategoriesToCreate', () => {
  it('leaves out a category to create that exists ignoring case: the backend uses it', () => {
    const resolutions: BottleImportResolutions = {
      categories: { gin: creating('GIN'), vodka: creating('Vodka'), rhum: { action: 'use_existing', existingId: 1 } },
      bottles: {},
    };
    expect(countCategoriesToCreate(resolutions, existing)).toBe(1);
  });
});
