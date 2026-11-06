import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PRISMA_DIR, resolveDatabasePath } from '../lib/databasePath';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma, schemaTables,
  seedCategory, seedBottle, seedIngredient, seedFullCocktail, seedMenu, seedMenuSection,
  addCocktailToMenu, addBottleToMenu, excludeBottleFromMenu, findSystemMenu,
} from './helpers';
import { TEST_DATABASE_DIR } from './testDatabase';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

async function rowCountByTable(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of schemaTables()) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM "${table}"`);
    counts[table] = Number(rows[0].count);
  }
  return counts;
}

/** At least one row in every table, linked by foreign keys as the app links them. */
async function seedEveryModel() {
  const rum = await seedCategory({ name: 'Rum' });
  const bottle = await seedBottle({ categoryId: rum.id });
  const lime = await seedIngredient({ name: 'Lime' });
  const cocktail = await seedFullCocktail({
    ingredients: [
      { sourceType: 'BOTTLE', bottleId: bottle.id },
      { sourceType: 'CATEGORY', categoryId: rum.id, preferredBottleIds: [bottle.id] },
      { sourceType: 'INGREDIENT', ingredientId: lime.id },
    ],
  });
  const menu = await seedMenu();
  const section = await seedMenuSection(menu.id);
  await addCocktailToMenu(menu.id, cocktail.id, { menuSectionId: section.id });
  await addBottleToMenu(menu.id, bottle.id, { menuSectionId: section.id });
  await excludeBottleFromMenu((await findSystemMenu('aperitifs')).id, bottle.id);
}

describe('cleanDatabase', () => {
  it('empties every table of the schema', async () => {
    await seedEveryModel();
    const before = await rowCountByTable();
    // Guards the seeding above: a new model needs a row here to be checked below
    for (const table of schemaTables()) {
      expect(before[table], table).toBeGreaterThan(0);
    }

    await cleanDatabase();

    const after = await rowCountByTable();
    for (const table of schemaTables()) {
      expect(after[table], table).toBe(0);
    }
  });

  it('works on an empty database', async () => {
    await cleanDatabase();
    await cleanDatabase();

    expect(await prisma.user.count()).toBe(0);
  });
});

describe('seedFullCocktail', () => {
  it('creates the unit, the bottle, a recipe line and an instruction by default', async () => {
    const cocktail = await seedFullCocktail();

    expect(cocktail.ingredients.length).toBeGreaterThanOrEqual(1);
    expect(cocktail.instructions.length).toBeGreaterThanOrEqual(1);
    expect(cocktail.instructions[0]).toMatchObject({ stepNumber: 1, text: 'Shake with ice' });
    expect(await prisma.unit.count()).toBe(1);
    expect(await prisma.bottle.count()).toBe(1);
  });

  it('reuses an existing unit and keeps the given lines, quantities and steps in order', async () => {
    const first = await seedFullCocktail();
    const lime = await seedIngredient({ name: 'Lime' });

    const cocktail = await seedFullCocktail({
      name: 'Daiquiri',
      tags: 'classic',
      ingredients: [{ sourceType: 'INGREDIENT', ingredientId: lime.id, quantity: 2 }],
      instructions: ['Shake', 'Strain'],
    });

    expect(cocktail).toMatchObject({ name: 'Daiquiri', tags: 'classic' });
    expect(cocktail.ingredients).toEqual([
      expect.objectContaining({ ingredientId: lime.id, quantity: 2, unitId: first.ingredients[0].unitId, position: 0 }),
    ]);
    expect(cocktail.instructions.map((step) => [step.stepNumber, step.text])).toEqual([[1, 'Shake'], [2, 'Strain']]);
    expect(await prisma.unit.count()).toBe(1);
  });
});

describe('menu factories', () => {
  it('gives each menu its own default slug', async () => {
    const first = await seedMenu();
    const second = await seedMenu();

    expect(first.slug).not.toBe(second.slug);
  });

  it('persists the section of a cocktail added to a menu', async () => {
    const cocktail = await seedFullCocktail();
    const menu = await seedMenu({ isPublic: true });
    const section = await seedMenuSection(menu.id, { name: 'Classics' });

    const entry = await addCocktailToMenu(menu.id, cocktail.id, { menuSectionId: section.id, position: 3, isHidden: true });

    const stored = await prisma.menuCocktail.findUniqueOrThrow({ where: { id: entry.id }, include: { menuSection: true } });
    expect(stored).toMatchObject({ menuId: menu.id, cocktailId: cocktail.id, position: 3, isHidden: true });
    expect(stored.menuSection?.name).toBe('Classics');
  });

  it('adds a bottle to a menu without a section by default', async () => {
    const bottle = await seedBottle();
    const menu = await seedMenu({ type: 'APEROS' });

    const entry = await addBottleToMenu(menu.id, bottle.id);

    expect(entry).toMatchObject({ menuId: menu.id, bottleId: bottle.id, position: 0, isHidden: false, menuSectionId: null });
  });
});

describe('test database location', () => {
  it('opens a database in a folder of its own under prisma/, not next to the developer database', () => {
    const dbPath = resolveDatabasePath();

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(path.dirname(dbPath)).not.toBe(PRISMA_DIR);
    expect(path.dirname(dbPath)).toBe(TEST_DATABASE_DIR);
    expect(path.dirname(TEST_DATABASE_DIR)).toBe(PRISMA_DIR);
  });
});
