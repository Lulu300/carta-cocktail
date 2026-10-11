import { describe, it, expect, vi, afterEach } from 'vitest';
import { findNewRecipeDefects } from './recipeDefectsService';
import { IngredientLine } from '../validation/cocktails';

type SourceType = 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
type Line = { sourceType: SourceType; bottleId: number | null; categoryId: number | null; ingredientId: number | null; quantity: number };

const validLine: Line = { sourceType: 'BOTTLE', bottleId: 3, categoryId: null, ingredientId: null, quantity: 4 };

// A line as the database stores it: the source type is a plain string there
const stored = (line: Partial<Omit<Line, 'sourceType'> & { sourceType: string }>) => ({ ...validLine, ...line });
// A line as the update schema outputs it
const sent = (line: Partial<Line>) => ({ ...validLine, unitId: 1, ...line });

const paths = (issues: { path: string }[]) => issues.map((issue) => issue.path);

describe('findNewRecipeDefects', () => {
  it('finds nothing in lines without defects', () => {
    expect(findNewRecipeDefects([sent({}), sent({ quantity: 1 })], [])).toEqual([]);
  });

  it.each([
    ['BOTTLE', 'bottleId'],
    ['CATEGORY', 'categoryId'],
    ['INGREDIENT', 'ingredientId'],
  ] as const)('keeps a %s line whose %s the stored recipe already misses', (sourceType, key) => {
    const line = { sourceType, bottleId: null, [key]: null };
    expect(findNewRecipeDefects([sent(line)], [stored(line)])).toEqual([]);
  });

  it('keeps a quantity of 0 the stored recipe already has, wherever the line moved', () => {
    const storedLines = [stored({}), stored({ quantity: 0 })];
    expect(findNewRecipeDefects([sent({ quantity: 0 }), sent({})], storedLines)).toEqual([]);
  });

  it('refuses a missing key that the stored recipe does not have, with the issue of the strict schema', () => {
    const issues = findNewRecipeDefects([sent({}), sent({ bottleId: null })], [stored({})]);
    expect(issues).toEqual([
      { path: 'body.ingredients.1.bottleId', code: 'custom', message: 'Required when sourceType is BOTTLE' },
    ]);
  });

  it('counts missing keys per source type', () => {
    const storedLines = [stored({ sourceType: 'CATEGORY', bottleId: null, categoryId: null })];
    const issues = findNewRecipeDefects([sent({ bottleId: null })], storedLines);
    expect(paths(issues)).toEqual(['body.ingredients.0.bottleId']);
  });

  it('refuses the defective lines beyond those the stored recipe has', () => {
    const lines = [sent({ quantity: 0 }), sent({ quantity: 0 }), sent({ quantity: 0 })];
    const issues = findNewRecipeDefects(lines, [stored({ quantity: 0 })]);
    expect(paths(issues)).toEqual(['body.ingredients.1.quantity', 'body.ingredients.2.quantity']);
    expect(issues[0]).toMatchObject({ code: 'too_small' });
  });

  it('checks each defect of a line on its own', () => {
    const storedLines = [stored({ bottleId: null })];
    const issues = findNewRecipeDefects([sent({ bottleId: null, quantity: 0 })], storedLines);
    expect(paths(issues)).toEqual(['body.ingredients.0.quantity']);
  });

  it('ignores stored lines with an unknown source type', () => {
    const storedLines = [stored({ sourceType: 'GARNISH', bottleId: null })];
    expect(paths(findNewRecipeDefects([sent({ bottleId: null })], storedLines))).toEqual(['body.ingredients.0.bottleId']);
  });

  // One line per defect kind, with no other defect
  const defectiveLines = [
    ['bottleId', sent({ bottleId: null })],
    ['categoryId', sent({ sourceType: 'CATEGORY', bottleId: null, categoryId: null })],
    ['ingredientId', sent({ sourceType: 'INGREDIENT', bottleId: null, ingredientId: null })],
    ['quantity', sent({ quantity: 0 })],
  ] as const;

  it.each(defectiveLines)('gets exactly one issue from the strict schema for a missing %s', (defect, line) => {
    const strict = IngredientLine.safeParse(line).error?.issues ?? [];
    expect(strict.filter((issue) => issue.path[0] === defect)).toHaveLength(1);

    const issues = findNewRecipeDefects([line], []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: `body.ingredients.0.${defect}`, message: strict[0].message });
  });

  describe('when the strict schema no longer reports the defect', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it.each(defectiveLines)('still refuses a missing %s with a fallback issue', (defect, line) => {
      vi.spyOn(IngredientLine, 'safeParse').mockReturnValue({ success: true, data: line } as never);

      const issues = findNewRecipeDefects([line], []);
      expect(issues).toEqual([{ path: `body.ingredients.0.${defect}`, code: 'custom', message: expect.any(String) }]);
    });

    it('names the source type in the fallback message of a missing key', () => {
      vi.spyOn(IngredientLine, 'safeParse').mockReturnValue({ success: true, data: {} } as never);
      const [issue] = findNewRecipeDefects([sent({ sourceType: 'CATEGORY', bottleId: null, categoryId: null })], []);
      expect(issue.message).toBe('Required when sourceType is CATEGORY');
    });
  });
});
