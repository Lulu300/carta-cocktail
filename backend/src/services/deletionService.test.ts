import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  prisma, seedUnit, seedCategory, seedBottle, seedCocktailUsing,
} from '../test/helpers';
import { isForceRequested } from './deletionService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('isForceRequested', () => {
  it('accepts only force=true', () => {
    expect(isForceRequested('true')).toBe(true);
    expect(isForceRequested(undefined)).toBe(false);
    expect(isForceRequested('1')).toBe(false);
    expect(isForceRequested(['true', 'true'])).toBe(false);
  });
});

// The service refuses before the database is asked: these tests check the
// onDelete rules of the schema themselves, so a cascade can never come back unnoticed.
describe('onDelete rules of the schema', () => {
  const FOREIGN_KEY_FAILURE = { code: 'P2003' };

  it('restricts deleting a category that holds a bottle', async () => {
    const category = await seedCategory();
    await seedBottle({ categoryId: category.id });

    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toMatchObject(FOREIGN_KEY_FAILURE);
    expect(await prisma.bottle.count()).toBe(1);
  });

  it('restricts deleting a bottle used by a recipe line', async () => {
    const unit = await seedUnit();
    const bottle = await seedBottle();
    await seedCocktailUsing('Daiquiri', unit.id, [{ sourceType: 'BOTTLE', bottleId: bottle.id }]);

    await expect(prisma.bottle.delete({ where: { id: bottle.id } })).rejects.toMatchObject(FOREIGN_KEY_FAILURE);
    expect(await prisma.cocktailIngredient.count()).toBe(1);
  });

  it('cascades the deletion of a bottle to its preferences', async () => {
    const unit = await seedUnit();
    const category = await seedCategory();
    const bottle = await seedBottle({ categoryId: category.id });
    await seedCocktailUsing('Mojito', unit.id, [
      { sourceType: 'CATEGORY', categoryId: category.id, preferredBottleIds: [bottle.id] },
    ]);

    await prisma.bottle.delete({ where: { id: bottle.id } });

    expect(await prisma.cocktailPreferredBottle.count()).toBe(0);
    expect(await prisma.cocktailIngredient.count()).toBe(1);
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
