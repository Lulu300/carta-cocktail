import { describe, it, expect } from 'vitest';
import { CocktailCreate, CocktailUpdate, IngredientLine, Instruction } from './cocktails';

const bottleLine = { sourceType: 'BOTTLE', bottleId: 3, quantity: 4, unitId: 1 };

function issues(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('IngredientLine', () => {
  it('accepts a line shaped like the cocktail form sends it', () => {
    const line = { ...bottleLine, categoryId: null, ingredientId: null, preferredBottleIds: undefined };
    expect(IngredientLine.safeParse(line).success).toBe(true);
  });

  it.each([
    ['BOTTLE', 'bottleId'],
    ['CATEGORY', 'categoryId'],
    ['INGREDIENT', 'ingredientId'],
  ])('requires the foreign key of a %s line', (sourceType, key) => {
    const result = IngredientLine.safeParse({ sourceType, quantity: 1, unitId: 1 });
    expect(issues(result)).toEqual([key]);
  });

  it('refuses the foreign keys of the other source types', () => {
    const result = IngredientLine.safeParse({ ...bottleLine, categoryId: 2, ingredientId: 5 });
    expect(issues(result)).toEqual(['categoryId', 'ingredientId']);
  });

  it('accepts preferred bottles on a CATEGORY line only', () => {
    const categoryLine = { sourceType: 'CATEGORY', categoryId: 2, quantity: 1, unitId: 1, preferredBottleIds: [3] };
    expect(IngredientLine.safeParse(categoryLine).success).toBe(true);
    expect(issues(IngredientLine.safeParse({ ...bottleLine, preferredBottleIds: [3] }))).toEqual(['preferredBottleIds']);
    expect(IngredientLine.safeParse({ ...bottleLine, preferredBottleIds: [] }).success).toBe(true);
  });

  it('rejects an unknown source type', () => {
    expect(issues(IngredientLine.safeParse({ ...bottleLine, sourceType: 'GARNISH' }))).toEqual(['sourceType']);
  });

  it.each([0, -1])('rejects a quantity of %s', (quantity) => {
    expect(issues(IngredientLine.safeParse({ ...bottleLine, quantity }))).toEqual(['quantity']);
  });

  it.each([0, 1.5, '1', null])('rejects a unitId of %s', (unitId) => {
    expect(issues(IngredientLine.safeParse({ ...bottleLine, unitId }))).toEqual(['unitId']);
  });
});

describe('Instruction', () => {
  it('normalizes a plain string and an object to the trimmed text', () => {
    expect(Instruction.parse('Shake')).toBe('Shake');
    expect(Instruction.parse({ text: ' Strain ' })).toBe('Strain');
  });

  it.each(['', '   ', { text: '' }, { text: 42 }, {}])('rejects %j', (step) => {
    expect(Instruction.safeParse(step).success).toBe(false);
  });
});

describe('CocktailCreate and CocktailUpdate', () => {
  it('requires a name on creation only', () => {
    expect(issues(CocktailCreate.safeParse({}))).toEqual(['name']);
    expect(CocktailUpdate.safeParse({}).success).toBe(true);
  });

  it('accepts tags as an array, a string or null', () => {
    for (const tags of [['a', 'b'], 'a,b', null]) {
      expect(CocktailCreate.safeParse({ name: 'Mojito', tags }).success).toBe(true);
    }
  });
});
