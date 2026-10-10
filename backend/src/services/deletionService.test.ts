import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../test/helpers';
import { isForceRequested } from './deletionService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });

describe('isForceRequested', () => {
  it('accepts only force=true', () => {
    expect(isForceRequested('true')).toBe(true);
    expect(isForceRequested(undefined)).toBe(false);
    expect(isForceRequested('1')).toBe(false);
    expect(isForceRequested(['true', 'true'])).toBe(false);
  });
});

// The deletion checks look up recipe lines and menu entries by foreign key:
// each lookup must use an index instead of scanning the table.
describe('foreign key indexes', () => {
  async function queryPlan(sql: string): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(`EXPLAIN QUERY PLAN ${sql}`);
    return rows.map((row) => row.detail).join('\n');
  }

  it.each([
    ['CocktailIngredient', 'cocktailId'],
    ['CocktailIngredient', 'bottleId'],
    ['CocktailIngredient', 'categoryId'],
    ['CocktailIngredient', 'ingredientId'],
    ['CocktailIngredient', 'unitId'],
    ['CocktailPreferredBottle', 'bottleId'],
    ['CocktailInstruction', 'cocktailId'],
    ['MenuCocktail', 'cocktailId'],
    ['MenuCocktail', 'menuSectionId'],
    ['MenuBottle', 'bottleId'],
    ['MenuBottle', 'menuSectionId'],
    ['MenuSection', 'menuId'],
    ['Bottle', 'categoryId'],
    ['Category', 'type'],
  ])('%s.%s', async (table, column) => {
    const plan = await queryPlan(`SELECT * FROM "${table}" WHERE "${column}" = 1`);
    expect(plan).toContain(`USING INDEX ${table}_${column}_idx`);
  });
});
