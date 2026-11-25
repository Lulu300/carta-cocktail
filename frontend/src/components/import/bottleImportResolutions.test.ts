import { describe, it, expect } from 'vitest';
import { buildCategory } from '../../test/factories';
import type { BottleCategoryPreview, BottleImportPreviewResponse, BottleImportResolutions } from '../../types';
import {
  buildAutoCategoryResolutions,
  countCategoriesToCreate,
  countCategoriesToResolve,
  defaultCategoryData,
  existingCategoryFor,
  rowCategories,
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

  it('counts once two categories of the file created under names equal ignoring case, as the rows step offers them', () => {
    const categories = { mezcal: creating('Mezcal'), 'mezcal joven': creating('MEZCAL') };
    expect(countCategoriesToCreate({ categories, bottles: {} }, existing)).toBe(1);
    expect(rowCategories(existing, categories).options.filter((option) => option.isNew)).toEqual([{ name: 'Mezcal', isNew: true }]);
  });
});

describe('rowCategories', () => {
  const existingRhum = { name: 'Rhum', isNew: false };
  const existingUpperRhum = { name: 'RHUM', isNew: false };
  const existingGin = { name: 'Gin', isNew: false };

  it('shows a row in the existing category its name matches ignoring case', () => {
    const categories = rowCategories([rhum, gin], { rhum: { action: 'use_existing', existingId: 1 } });
    expect(categories.categoryOf('rhum')).toEqual(existingRhum);
    expect(categories.categoryOf(' RHUM ')).toEqual(existingRhum);
    expect(categories.categoryOf('')).toBeUndefined();
    expect(categories.options).toEqual([existingRhum, existingGin]);
  });

  it('shows a row in the match picked for an ambiguous category, and leaves out the one it cannot reach', () => {
    const unresolved = rowCategories(existing, {});
    expect(unresolved.categoryOf('rhum')).toBeUndefined();
    expect(unresolved.categoryOf('Rhum')).toEqual(existingRhum);
    expect(unresolved.options).toEqual([existingRhum, existingUpperRhum, existingGin]);

    const resolved = rowCategories(existing, { rhum: { action: 'use_existing', existingId: 2 } });
    expect(resolved.categoryOf('rhum')).toEqual(existingUpperRhum);
    // The confirmation puts a row naming `Rhum` in the category resolved for `rhum`
    expect(resolved.categoryOf('Rhum')).toEqual(existingUpperRhum);
    expect(resolved.options).toEqual([existingUpperRhum, existingGin]);
  });

  it('does not offer to create a category that exists ignoring case, and shows the existing one', () => {
    const categories = rowCategories(existing, { gin: creating('GIN'), vodka: creating('Vodka') });
    expect(categories.categoryOf('gin')).toEqual(existingGin);
    expect(categories.categoryOf('vodka')).toEqual({ name: 'Vodka', isNew: true });
    expect(categories.options).toEqual([existingRhum, existingUpperRhum, existingGin, { name: 'Vodka', isNew: true }]);
  });

  it('shows a row in a category created under another name, which the existing one of the file name gives way to', () => {
    const categories = rowCategories([rhum, gin], { rhum: creating('Rhum agricole') });
    const created = { name: 'Rhum agricole', isNew: true };
    expect(categories.categoryOf('rhum')).toEqual(created);
    expect(categories.categoryOf('rhum agricole')).toEqual(created);
    expect(categories.options).toEqual([existingGin, created]);
  });

  it('creates once a name two categories of the file share ignoring case, and the file name of a blank one', () => {
    const categories = rowCategories([gin], { vodka: creating('Vodka'), wodka: creating('VODKA'), rye: creating('  ') });
    expect(categories.categoryOf('wodka')).toEqual({ name: 'Vodka', isNew: true });
    expect(categories.categoryOf('rye')).toEqual({ name: 'rye', isNew: true });
    expect(categories.options).toEqual([existingGin, { name: 'Vodka', isNew: true }, { name: 'rye', isNew: true }]);
  });

  it('shows no category for a name to create that several categories hold: the confirmation refuses it', () => {
    const categories = rowCategories(existing, { rhum: creating('rhum') });
    expect(categories.categoryOf('rhum')).toBeUndefined();
    expect(categories.options.filter((option) => option.isNew)).toEqual([]);
  });
});
