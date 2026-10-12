import { describe, expect, it } from 'vitest';
import type { Cocktail } from '../../../types';
import {
  EMPTY_COCKTAIL_FORM,
  cocktailFormSchema,
  fromCocktail,
  newIngredientRow,
  toCocktailInput,
  type CocktailFormValues,
  type IngredientRowValues,
  type SourceType,
  isKeptStoredDefect,
} from './cocktailFormSchema';

const EMPTY_ROW: IngredientRowValues = {
  sourceType: 'INGREDIENT',
  bottleId: null,
  categoryId: null,
  ingredientId: null,
  preferredBottleIds: [],
  quantity: 2,
  unitId: 1,
  storedLine: null,
};

function formWith(rows: IngredientRowValues[], overrides: Partial<CocktailFormValues> = {}): CocktailFormValues {
  return { ...EMPTY_COCKTAIL_FORM, name: 'Mojito', ingredients: rows, ...overrides };
}

/** Error messages by path, e.g. { 'ingredients.0.bottleId': 'validation.sourceRequired' }. */
function errorsOf(values: CocktailFormValues): Record<string, string> {
  const result = cocktailFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('cocktailFormSchema', () => {
  it.each<[SourceType, Partial<IngredientRowValues>]>([
    ['BOTTLE', { bottleId: 3 }],
    ['CATEGORY', { categoryId: 4, preferredBottleIds: [3] }],
    ['INGREDIENT', { ingredientId: 5 }],
  ])('accepts a %s line pointing to its source', (sourceType, ids) => {
    expect(errorsOf(formWith([{ ...EMPTY_ROW, sourceType, ...ids }]))).toEqual({});
  });

  it.each([
    ['BOTTLE', 'bottleId', { categoryId: 4 }],
    ['CATEGORY', 'categoryId', { bottleId: 3 }],
    ['INGREDIENT', 'ingredientId', { bottleId: 3 }],
  ] as const)('refuses a %s line without its source, even when another id is set', (sourceType, key, otherIds) => {
    expect(errorsOf(formWith([{ ...EMPTY_ROW, sourceType, ...otherIds }]))).toEqual({
      [`ingredients.0.${key}`]: 'validation.sourceRequired',
    });
  });

  it('reports every error of a line at once', () => {
    const row = { ...EMPTY_ROW, quantity: Number.NaN, unitId: null };
    expect(errorsOf(formWith([row]))).toEqual({
      'ingredients.0.quantity': 'validation.positive',
      'ingredients.0.unitId': 'validation.required',
      'ingredients.0.ingredientId': 'validation.sourceRequired',
    });
  });

  it('refuses a negative quantity', () => {
    expect(errorsOf(formWith([{ ...EMPTY_ROW, ingredientId: 5, quantity: -1 }]))).toEqual({
      'ingredients.0.quantity': 'validation.positive',
    });
  });

  it('refuses a quantity of zero and a blank name', () => {
    const values = formWith([{ ...EMPTY_ROW, ingredientId: 5, quantity: 0 }], { name: '   ' });
    expect(errorsOf(values)).toEqual({
      name: 'validation.required',
      'ingredients.0.quantity': 'validation.positive',
    });
  });
});

describe('toCocktailInput', () => {
  it('splits the tags, drops blank steps and empties the ids of the other sources', () => {
    const values = cocktailFormSchema.parse(formWith(
      [
        { ...EMPTY_ROW, sourceType: 'BOTTLE', bottleId: 3, categoryId: 4, preferredBottleIds: [3] },
        { ...EMPTY_ROW, sourceType: 'CATEGORY', categoryId: 4, ingredientId: 5, preferredBottleIds: [3] },
      ],
      {
        name: ' Mojito ',
        description: '  ',
        notes: 'Fresh mint',
        tags: ' rum, ,mint ',
        isAvailable: false,
        instructions: [{ text: 'Muddle' }, { text: '  ' }, { text: 'Stir' }],
      },
    ));

    expect(toCocktailInput(values)).toEqual({
      name: 'Mojito',
      description: null,
      notes: 'Fresh mint',
      tags: ['rum', 'mint'],
      isAvailable: false,
      ingredients: [
        { sourceType: 'BOTTLE', bottleId: 3, categoryId: null, ingredientId: null, quantity: 2, unitId: 1, preferredBottleIds: undefined },
        { sourceType: 'CATEGORY', bottleId: null, categoryId: 4, ingredientId: null, quantity: 2, unitId: 1, preferredBottleIds: [3] },
      ],
      instructions: [{ text: 'Muddle' }, { text: 'Stir' }],
    });
  });
});

describe('fromCocktail', () => {
  const cocktail: Cocktail = {
    id: 1,
    name: 'Mojito',
    description: null,
    notes: 'Fresh',
    imagePath: null,
    tags: 'rum,mint',
    isAvailable: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ingredients: [
      {
        id: 7, cocktailId: 1, quantity: 5, unitId: 2, sourceType: 'CATEGORY', bottleId: null, categoryId: 4,
        ingredientId: null, position: 0, preferredBottles: [{ id: 1, cocktailIngredientId: 7, bottleId: 3 }],
      },
      { id: 8, cocktailId: 1, quantity: 1, unitId: 3, sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 5, position: 1 },
    ],
    instructions: [{ id: 1, cocktailId: 1, stepNumber: 1, text: 'Muddle' }],
  };

  it('fills the form with every field of a complete cocktail', () => {
    expect(fromCocktail(cocktail)).toEqual({
      name: 'Mojito',
      description: '',
      notes: 'Fresh',
      tags: 'rum,mint',
      isAvailable: true,
      ingredients: [
        { sourceType: 'CATEGORY', bottleId: null, categoryId: 4, ingredientId: null, preferredBottleIds: [3], quantity: 5, unitId: 2, storedLine: null },
        { sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 5, preferredBottleIds: [], quantity: 1, unitId: 3, storedLine: null },
      ],
      instructions: [{ text: 'Muddle' }],
    });
  });

  it('gives an empty step to type in when the recipe has none', () => {
    const values = fromCocktail({ ...cocktail, notes: null, ingredients: undefined, instructions: [] });
    expect(values.notes).toBe('');
    expect(values.ingredients).toEqual([]);
    expect(values.instructions).toEqual([{ text: '' }]);
  });
});

describe('newIngredientRow', () => {
  it('starts on the first ingredient and the first unit', () => {
    const row = newIngredientRow(
      [{ id: 5, name: 'Lime', icon: null, isAvailable: true, createdAt: '2024-01-01' }],
      [{ id: 2, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 }],
    );
    expect(row).toMatchObject({ sourceType: 'INGREDIENT', ingredientId: 5, unitId: 2, quantity: 1 });
  });

  it('leaves the ids empty when the lists are empty', () => {
    expect(newIngredientRow([], [])).toMatchObject({ ingredientId: null, unitId: null });
  });
});

describe('lines stored with a defect (C-21)', () => {
  const orphan: IngredientRowValues = { ...EMPTY_ROW, sourceType: 'CATEGORY', quantity: 0 };

  /** The row as fromCocktail gives it for a line stored with a defect. */
  function loaded(row: IngredientRowValues): IngredientRowValues {
    const { sourceType, bottleId, categoryId, ingredientId, preferredBottleIds, quantity, unitId } = row;
    return { ...row, storedLine: { sourceType, bottleId, categoryId, ingredientId, preferredBottleIds, quantity, unitId } };
  }

  it('accepts a loaded line kept as it was, with its missing source and quantity of 0', () => {
    const row = loaded(orphan);
    expect(isKeptStoredDefect(row)).toBe(true);
    expect(errorsOf(formWith([row]))).toEqual({});
  });

  it('validates a loaded line strictly once it changes, even when it keeps its defect', () => {
    const row = { ...loaded(orphan), unitId: 2 };
    expect(isKeptStoredDefect(row)).toBe(false);
    expect(errorsOf(formWith([row]))).toEqual({
      'ingredients.0.categoryId': 'validation.sourceRequired',
      'ingredients.0.quantity': 'validation.positive',
    });
  });

  it('takes the preferred bottles into account, whatever their order', () => {
    const row = loaded({ ...orphan, categoryId: 4, preferredBottleIds: [1, 2] });
    expect(isKeptStoredDefect({ ...row, preferredBottleIds: [2, 1] })).toBe(true);
    expect(isKeptStoredDefect({ ...row, preferredBottleIds: [2] })).toBe(false);
  });

  it('keeps a stored copy of the defective lines only, and accepts them as loaded', () => {
    const values = fromCocktail({
      id: 1, name: 'Old', description: null, notes: null, imagePath: null, tags: '', isAvailable: true,
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
      ingredients: [
        { id: 1, cocktailId: 1, quantity: 0, unitId: 1, sourceType: 'INGREDIENT', bottleId: null, categoryId: null, ingredientId: 5, position: 0 },
        { id: 2, cocktailId: 1, quantity: 2, unitId: 1, sourceType: 'BOTTLE', bottleId: null, categoryId: null, ingredientId: null, position: 1 },
        { id: 3, cocktailId: 1, quantity: 2, unitId: 1, sourceType: 'BOTTLE', bottleId: 3, categoryId: null, ingredientId: null, position: 2 },
      ],
    });
    expect(values.ingredients.map((row) => row.storedLine !== null)).toEqual([true, true, false]);
    expect(errorsOf({ ...values, name: 'Old' })).toEqual({});
  });
});
