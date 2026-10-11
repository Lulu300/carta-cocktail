import { describe, it, expect } from 'vitest';
import { ImportConfirm, ImportRecipeV1, ImportResolutions } from './cocktailImport';

const recipe = {
  version: 1,
  exportedAt: '2026-10-11T00:00:00.000Z',
  cocktail: {
    name: 'Daiquiri',
    description: null,
    notes: null,
    tags: ['classic'],
    ingredients: [{
      sourceType: 'CATEGORY',
      sourceName: 'Rum',
      sourceDetail: { type: 'SPIRIT', desiredStock: 1, nameTranslations: { fr: 'Rhum', en: 'Rum' } },
      quantity: 6,
      unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
      position: 0,
      preferredBottles: [{ name: 'Havana', categoryName: 'Rum' }],
    }],
    instructions: [{ stepNumber: 1, text: 'Shake' }],
  },
};

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('ImportRecipeV1', () => {
  it('accepts a recipe written by the export', () => {
    expect(ImportRecipeV1.safeParse(recipe).success).toBe(true);
  });

  it('accepts version 1 only', () => {
    expect(issuePaths(ImportRecipeV1.safeParse({ ...recipe, version: 2 }))).toEqual(['version']);
  });

  it('requires the cocktail name', () => {
    const result = ImportRecipeV1.safeParse({ ...recipe, cocktail: { ...recipe.cocktail, name: '' } });
    expect(issuePaths(result)).toEqual(['cocktail.name']);
  });

  it('requires the source name and the unit abbreviation of each ingredient', () => {
    const line = { ...recipe.cocktail.ingredients[0], sourceName: '', unit: { name: 'Centilitre' } };
    const result = ImportRecipeV1.safeParse({ ...recipe, cocktail: { ...recipe.cocktail, ingredients: [line] } });
    expect(issuePaths(result).sort()).toEqual(['cocktail.ingredients.0.sourceName', 'cocktail.ingredients.0.unit.abbreviation']);
  });
});

describe('ImportResolutions', () => {
  it('keeps only the listed fields of each created entity', () => {
    const resolutions = ImportResolutions.parse({
      units: { cl: { action: 'create', data: { id: 9, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 } } },
      categories: { rum: { action: 'create', data: { id: 9, createdAt: 'x', name: 'Rum', desiredStock: 0 } } },
      bottles: { havana: { action: 'create', data: { id: 9, purchasePrice: 99, name: 'Havana', categoryName: 'Rum', capacityMl: 700 } } },
      ingredients: { lime: { action: 'create', data: { id: 9, isAvailable: false, name: 'Lime', icon: null } } },
    });

    expect(resolutions.units?.cl.data).toEqual({ name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 });
    expect(resolutions.categories?.rum.data).toEqual({ name: 'Rum', type: 'SPIRIT', desiredStock: 0 });
    expect(resolutions.bottles?.havana.data).toEqual({ name: 'Havana', categoryName: 'Rum', capacityMl: 700 });
    expect(resolutions.ingredients?.lime.data).toEqual({ name: 'Lime', icon: null });
  });

  it('applies the bounds of a bottle created by hand', () => {
    const result = ImportResolutions.safeParse({
      bottles: { havana: { action: 'create', data: { name: 'Havana', capacityMl: 0, remainingPercent: 150, alcoholPercentage: 120 } } },
    });
    expect(issuePaths(result).sort()).toEqual([
      'bottles.havana.data.alcoholPercentage',
      'bottles.havana.data.capacityMl',
      'bottles.havana.data.remainingPercent',
    ]);
  });

  it('rejects an unknown action', () => {
    expect(issuePaths(ImportResolutions.safeParse({ units: { cl: { action: 'merge' } } }))).toEqual(['units.cl.action']);
  });
});

describe('ImportConfirm', () => {
  it('accepts a confirmation without resolutions', () => {
    expect(ImportConfirm.safeParse({ recipe }).success).toBe(true);
  });
});
