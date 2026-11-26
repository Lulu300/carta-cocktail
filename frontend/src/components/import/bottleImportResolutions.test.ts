import { describe, it, expect } from 'vitest';
import { buildCategory } from '../../test/factories';
import type { BottleCategoryPreview, BottleImportPreviewResponse, BottleImportResolutions } from '../../types';
import {
  buildAutoCategoryResolutions,
  countCategoriesToCreate,
  countCategoriesToResolve,
  countRowsWithoutCategory,
  defaultCategoryData,
  existingCategoryFor,
  rowCategories,
  type RowCategories,
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
    expect(rowCategories(existing, categories).options.filter((option) => option.isNew)).toEqual([newCategory('Mezcal', 'mezcal')]);
  });
});

function newCategory(name: string, key: string) {
  return { name, isNew: true, choice: { categoryName: key } };
}

describe('countRowsWithoutCategory', () => {
  const rowsPreview: BottleImportPreviewResponse = {
    ...previewOf([]),
    bottles: ['', '', 'Gin'].map((categoryName) => ({
      ref: {
        name: 'Havana', categoryName, capacityMl: 700, remainingPercent: 100, alcoholPercentage: null, purchasePrice: null,
        location: null, openedAt: null, isApero: false, isDigestif: false, quantity: 1,
      },
      needsCategory: categoryName === '',
      potentialDuplicates: [],
    })),
  };

  it('counts the imported rows that name no category and pick none by id', () => {
    const bottles = { 0: { action: 'import' as const, categoryId: 1 }, 1: { action: 'import' as const } };
    expect(countRowsWithoutCategory(rowsPreview, { categories: {}, bottles })).toBe(1);
    expect(countRowsWithoutCategory(rowsPreview, { categories: {}, bottles: { ...bottles, 1: { action: 'skip' } } })).toBe(0);
  });
});

describe('rowCategories', () => {
  const existingRhum = { name: 'Rhum', isNew: false, choice: { categoryId: 1 } };
  const existingUpperRhum = { name: 'RHUM', isNew: false, choice: { categoryId: 2 } };
  const existingGin = { name: 'Gin', isNew: false, choice: { categoryId: 3 } };

  // A row that keeps the name of the file, or sends another one
  function categoryOfName(categories: RowCategories, name: string) {
    return categories.categoryOf(name, undefined);
  }

  it('shows a row in the existing category its name matches ignoring case', () => {
    const categories = rowCategories([rhum, gin], { rhum: { action: 'use_existing', existingId: 1 } });
    expect(categoryOfName(categories, 'rhum')).toEqual(existingRhum);
    expect(categoryOfName(categories, ' RHUM ')).toEqual(existingRhum);
    expect(categoryOfName(categories, '')).toBeUndefined();
    expect(categories.options).toEqual([existingRhum, existingGin]);
  });

  it('shows a row in the match picked for an ambiguous category, and still offers the other one by its id', () => {
    const unresolved = rowCategories(existing, {});
    expect(categoryOfName(unresolved, 'rhum')).toBeUndefined();
    expect(categoryOfName(unresolved, 'Rhum')).toEqual(existingRhum);
    expect(unresolved.options).toEqual([existingRhum, existingUpperRhum, existingGin]);

    const resolved = rowCategories(existing, { rhum: { action: 'use_existing', existingId: 2 } });
    expect(categoryOfName(resolved, 'rhum')).toEqual(existingUpperRhum);
    // The confirmation puts a row naming `Rhum` in the category resolved for `rhum`, not one picking its id
    expect(categoryOfName(resolved, 'Rhum')).toEqual(existingUpperRhum);
    expect(resolved.categoryOf('rhum', { action: 'import', categoryId: 1 })).toEqual(existingRhum);
    expect(resolved.options).toEqual([existingRhum, existingUpperRhum, existingGin]);
  });

  it('shows no category for the id of no existing one, and the file category of a skipped row', () => {
    const categories = rowCategories(existing, {});
    expect(categories.categoryOf('Gin', { action: 'import', categoryId: 99 })).toBeUndefined();
    expect(categories.categoryOf('Gin', { action: 'skip' })).toEqual(existingGin);
  });

  it('does not offer to create a category that exists ignoring case, and shows the existing one', () => {
    const categories = rowCategories(existing, { gin: creating('GIN'), vodka: creating('Vodka') });
    expect(categoryOfName(categories, 'gin')).toEqual(existingGin);
    expect(categoryOfName(categories, 'vodka')).toEqual(newCategory('Vodka', 'vodka'));
    expect(categories.options).toEqual([existingRhum, existingUpperRhum, existingGin, newCategory('Vodka', 'vodka')]);
  });

  it('shows a row in a category created under another name, and offers the existing one of the file name by its id', () => {
    const categories = rowCategories([rhum, gin], { rhum: creating('Rhum agricole') });
    const created = newCategory('Rhum agricole', 'rhum');
    expect(categoryOfName(categories, 'rhum')).toEqual(created);
    expect(categoryOfName(categories, 'rhum agricole')).toEqual(created);
    expect(categories.options).toEqual([existingRhum, existingGin, created]);
  });

  // C-68: before, `Rhum` was no option, since a row naming it goes in `Rhum agricole`
  it('shows a row in the existing category its file category is created as, which another one of the file names', () => {
    const categories = rowCategories([rhum, gin], { rhum: creating('Rhum agricole'), gin: creating('Rhum') });
    expect(categoryOfName(categories, 'gin')).toEqual(existingRhum);
    expect(categories.options).toEqual([existingRhum, existingGin, newCategory('Rhum agricole', 'rhum')]);
  });

  it('offers a category to create under the key that creates it, as its name is the key of another one', () => {
    const categories = rowCategories([], { mezcal: creating('Tequila'), tequila: creating('Sotol') });
    expect(categories.options).toEqual([newCategory('Tequila', 'mezcal'), newCategory('Sotol', 'tequila')]);
    // A row naming `Tequila` goes in the category resolved for `tequila`
    expect(categoryOfName(categories, 'Tequila')).toEqual(newCategory('Sotol', 'tequila'));
  });

  it('creates once a name two categories of the file share ignoring case, and the file name of a blank one', () => {
    const categories = rowCategories([gin], { vodka: creating('Vodka'), wodka: creating('VODKA'), rye: creating('  ') });
    expect(categoryOfName(categories, 'wodka')).toEqual(newCategory('Vodka', 'vodka'));
    expect(categoryOfName(categories, 'rye')).toEqual(newCategory('rye', 'rye'));
    expect(categories.options).toEqual([existingGin, newCategory('Vodka', 'vodka'), newCategory('rye', 'rye')]);
  });

  it('shows no category for a name to create that several categories hold: the confirmation refuses it', () => {
    const categories = rowCategories(existing, { rhum: creating('rhum') });
    expect(categoryOfName(categories, 'rhum')).toBeUndefined();
    expect(categories.options.filter((option) => option.isNew)).toEqual([]);
  });
});
