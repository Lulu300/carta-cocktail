import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  prisma, seedCategory, seedUnit, seedBottle, seedIngredient, seedCocktailUsing,
} from '../test/helpers';
import {
  calculateCocktailAvailability, calculateAllCocktailsAvailability, calculateAvailabilities, computeAvailability,
  buildStockSnapshot,
  LOW_STOCK_THRESHOLD, UNLIMITED_SERVINGS,
  type RecipeLine, type StockBottle, type StockIngredient, type StockSnapshot,
} from './availabilityService';
import { NotFoundError } from '../errors';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

const ML = { abbreviation: 'ml', conversionFactorToMl: 1 };
const CL = { abbreviation: 'cl', conversionFactorToMl: 10 };
const DASH = { abbreviation: 'dash', conversionFactorToMl: 0.6 };
const CUP = { abbreviation: 'tasse', conversionFactorToMl: 250 };
const GRAM = { abbreviation: 'g', conversionFactorToMl: null };
const SLICE = { abbreviation: 'rondelle', conversionFactorToMl: null };

const RUM = { id: 1, name: 'Rum' };
const GIN = { id: 2, name: 'Gin' };
const LIME = { id: 1, name: 'Lime', icon: '🍋', isAvailable: true };

function bottle(id: number, overrides: Partial<StockBottle> = {}): StockBottle {
  return { id, name: `Bottle ${id}`, categoryId: RUM.id, capacityMl: 700, remainingPercent: 100, ...overrides };
}

/** Stock built by hand: the computeAvailability tests need no database. */
function stock(bottles: StockBottle[], ingredients: StockIngredient[] = [LIME]): StockSnapshot {
  return buildStockSnapshot(bottles, [RUM, GIN], ingredients);
}

let nextLineId = 1;
function line(source: Partial<RecipeLine>): RecipeLine {
  return {
    id: nextLineId++, sourceType: 'BOTTLE', quantity: 1, unit: ML,
    bottleId: null, categoryId: null, ingredientId: null, preferredBottleIds: [],
    ...source,
  };
}

function bottleLine(bottleId: number, quantity: number, unit: RecipeLine['unit'] = ML): RecipeLine {
  return line({ sourceType: 'BOTTLE', bottleId, quantity, unit });
}

function categoryLine(
  categoryId: number, quantity: number, unit: RecipeLine['unit'] = ML, preferredBottleIds: number[] = [],
): RecipeLine {
  return line({ sourceType: 'CATEGORY', categoryId, quantity, unit, preferredBottleIds });
}

describe('computeAvailability', () => {
  it('treats a unit without ml factor as not measured: available while the bottle has stock', () => {
    const result = computeAvailability(1, [bottleLine(1, 2, GRAM)], stock([bottle(1, { remainingPercent: 5 })]));

    expect(result.isAvailable).toBe(true);
    expect(result.maxServings).toBe(UNLIMITED_SERVINGS);
    expect(result.ingredients[0]).toMatchObject({ isAvailable: true, availableCount: null, unit: 'g' });
  });

  it('treats a unit without ml factor as not measured: unavailable once the bottle is empty', () => {
    const result = computeAvailability(1, [bottleLine(1, 1, SLICE)], stock([bottle(1, { remainingPercent: 0 })]));

    expect(result.isAvailable).toBe(false);
    expect(result.maxServings).toBe(0);
    expect(result.ingredients[0]).toMatchObject({ isAvailable: false, availableCount: 0, reason: 'Bottle is empty' });
    expect(result.missingIngredients).toEqual(['Bottle 1']);
  });

  it('uses the unit factor of the database: one cup takes 250 ml', () => {
    const result = computeAvailability(1, [bottleLine(1, 1, CUP)], stock([bottle(1)]));

    expect(result.maxServings).toBe(2);
    expect(result.ingredients[0].availableCount).toBe(2);
  });

  it('treats a zero factor as not measured instead of dividing by zero', () => {
    const zero = { abbreviation: 'x', conversionFactorToMl: 0 };
    const result = computeAvailability(1, [bottleLine(1, 3, zero)], stock([bottle(1)]));

    expect(result.maxServings).toBe(UNLIMITED_SERVINGS);
  });

  it('adds up the lines that use the same bottle', () => {
    const lines = [bottleLine(1, 40), bottleLine(1, 40)];
    const result = computeAvailability(1, lines, stock([bottle(1, { capacityMl: 100 })]));

    expect(result.maxServings).toBe(1);
    expect(result.ingredients.map((ingredient) => ingredient.availableCount)).toEqual([1, 1]);
  });

  it('adds up the lines that use the same category', () => {
    const lines = [categoryLine(RUM.id, 4, CL), categoryLine(RUM.id, 2, CL)];
    const result = computeAvailability(1, lines, stock([bottle(1, { capacityMl: 300 })]));

    // 300 ml / (40 + 20) ml
    expect(result.maxServings).toBe(5);
  });

  it('sums the non-empty bottles of a category', () => {
    const bottles = [
      bottle(1, { capacityMl: 700, remainingPercent: 100 }),
      bottle(2, { capacityMl: 700, remainingPercent: 50 }),
      bottle(3, { capacityMl: 700, remainingPercent: 0 }),
      bottle(4, { categoryId: GIN.id }),
    ];
    const result = computeAvailability(1, [categoryLine(RUM.id, 4, CL)], stock(bottles));

    // (700 + 350) ml / 40 ml
    expect(result.maxServings).toBe(26);
    expect(result.ingredients[0]).toMatchObject({ name: 'Rum', availableCount: 26 });
  });

  it('gives a line that is not measured the servings of its measured resource', () => {
    const lines = [bottleLine(1, 40), bottleLine(1, 1, SLICE)];
    const result = computeAvailability(1, lines, stock([bottle(1, { capacityMl: 100 })]));

    expect(result.ingredients.map((ingredient) => ingredient.availableCount)).toEqual([2, 2]);
  });

  it('reports a category without stock', () => {
    const empty = stock([bottle(1, { remainingPercent: 0 })]);

    expect(computeAvailability(1, [categoryLine(RUM.id, 4, CL)], empty).ingredients[0])
      .toMatchObject({ isAvailable: false, availableCount: 0, reason: 'Insufficient Rum in stock' });
    expect(computeAvailability(1, [categoryLine(RUM.id, 1, SLICE)], empty).ingredients[0])
      .toMatchObject({ isAvailable: false, availableCount: 0, reason: 'No Rum bottles available' });
  });

  it('reports a bottle with too little left', () => {
    const result = computeAvailability(1, [bottleLine(1, 50)], stock([bottle(1, { capacityMl: 40 })]));

    expect(result.maxServings).toBe(0);
    expect(result.ingredients[0]).toMatchObject({
      isAvailable: false, availableCount: 0, reason: 'Bottle has insufficient quantity',
    });
  });

  it('counts every bottle of the category but flags an empty preferred bottle', () => {
    const bottles = [bottle(1, { remainingPercent: 0 }), bottle(2, { capacityMl: 100 })];
    const result = computeAvailability(1, [categoryLine(RUM.id, 40, ML, [1])], stock(bottles));

    expect(result.isAvailable).toBe(true);
    expect(result.maxServings).toBe(2);
    expect(result.ingredients[0].preferredAvailable).toBe(false);
  });

  it('flags a CATEGORY line whose preferred bottle has stock', () => {
    const result = computeAvailability(1, [categoryLine(RUM.id, 40, ML, [1, 99])], stock([bottle(1)]));

    expect(result.ingredients[0].preferredAvailable).toBe(true);
  });

  it('leaves preferredAvailable out of lines without preferred bottles', () => {
    const result = computeAvailability(1, [categoryLine(RUM.id, 40)], stock([bottle(1)]));

    expect(result.ingredients[0]).not.toHaveProperty('preferredAvailable');
  });

  it.each([
    ['a BOTTLE line without bottle', () => line({ sourceType: 'BOTTLE', bottleId: null }), 'Invalid ingredient configuration'],
    ['a CATEGORY line without category', () => line({ sourceType: 'CATEGORY', categoryId: null }), 'Invalid ingredient configuration'],
    ['an unknown source type', () => line({ sourceType: 'GARNISH', bottleId: 1 }), 'Invalid ingredient configuration'],
    ['a line on a missing bottle', () => bottleLine(99, 40), 'Bottle not found'],
    ['a line on a missing category', () => categoryLine(99, 40), 'Category not found'],
    ['a line on a missing ingredient', () => line({ sourceType: 'INGREDIENT', ingredientId: 99 }), 'Ingredient not found'],
  ])('makes %s unavailable', (_label, buildLine, reason) => {
    const result = computeAvailability(1, [buildLine()], stock([bottle(1)]));

    expect(result.isAvailable).toBe(false);
    expect(result.maxServings).toBe(0);
    expect(result.ingredients[0]).toMatchObject({ name: 'Unknown', isAvailable: false, availableCount: null, reason });
    expect(result.missingIngredients).toEqual(['Unknown']);
  });

  it('makes the cocktail unavailable when a free ingredient is marked unavailable', () => {
    const mint = { id: 2, name: 'Mint', icon: null, isAvailable: false };
    const lines = [bottleLine(1, 40), line({ sourceType: 'INGREDIENT', ingredientId: 2 })];
    const result = computeAvailability(1, lines, stock([bottle(1)], [mint]));

    expect(result.isAvailable).toBe(false);
    expect(result.maxServings).toBe(0);
    expect(result.ingredients[1]).toMatchObject({
      name: 'Mint', isAvailable: false, availableCount: 0, reason: 'Ingredient marked as unavailable',
    });
  });

  it('does not limit the servings with an available free ingredient', () => {
    const result = computeAvailability(1, [line({ sourceType: 'INGREDIENT', ingredientId: LIME.id })], stock([]));

    expect(result.maxServings).toBe(UNLIMITED_SERVINGS);
    expect(result.ingredients[0]).toMatchObject({ name: 'Lime', icon: '🍋', isAvailable: true, availableCount: null });
  });

  it('absorbs float error: 3 dashes on 1.8 ml make one serving', () => {
    const smallBottle = bottle(1, { capacityMl: 180, remainingPercent: 1 });
    const result = computeAvailability(1, [bottleLine(1, 3, DASH)], stock([smallBottle]));

    expect(result.maxServings).toBe(1);
  });

  it('absorbs float error: 0.1 ml on 0.3 ml makes three servings', () => {
    // 0.3 / 0.1 is 2.9999999999999996 in binary floating point
    const smallBottle = bottle(1, { capacityMl: 30, remainingPercent: 1 });
    const result = computeAvailability(1, [bottleLine(1, 0.1)], stock([smallBottle]));

    expect(result.maxServings).toBe(3);
  });

  it('takes the smallest servings across resources', () => {
    const lines = [bottleLine(1, 40), bottleLine(2, 40)];
    const result = computeAvailability(1, lines, stock([bottle(1), bottle(2, { remainingPercent: 20 })]));

    expect(result.maxServings).toBe(3);
  });

  it('shows 999 servings when nothing is measured, the real count when a bottle allows more', () => {
    expect(computeAvailability(1, [], stock([])).maxServings).toBe(UNLIMITED_SERVINGS);
    expect(computeAvailability(1, [bottleLine(1, 1, DASH)], stock([bottle(1)])).maxServings).toBe(1166);
  });

  it('warns once per resource at the low stock threshold, not above', () => {
    const lines = [bottleLine(1, 10), bottleLine(1, 10), bottleLine(2, 10)];
    const bottles = [
      bottle(1, { capacityMl: 20 * LOW_STOCK_THRESHOLD }),
      bottle(2, { capacityMl: 10 * (LOW_STOCK_THRESHOLD + 1) }),
    ];
    const result = computeAvailability(1, lines, stock(bottles));

    expect(result.lowStockWarnings).toEqual([`Bottle 1: only ${LOW_STOCK_THRESHOLD} servings left`]);
  });
});

describe('loading the stock', () => {
  /** Runs a calculation on a throwaway client that counts the SQL queries it sends. */
  async function countQueries(run: (db: PrismaClient) => Promise<unknown>): Promise<number> {
    const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    let queries = 0;
    db.$on('query', () => { queries += 1; });
    try {
      await run(db);
    } finally {
      await db.$disconnect();
    }
    return queries;
  }

  async function seedCocktails(count: number) {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const category = await seedCategory();
    const rum = await seedBottle({ categoryId: category.id });
    const lime = await seedIngredient({ name: 'Lime' });
    for (let index = 0; index < count; index++) {
      await seedCocktailUsing(`Cocktail ${index}`, unit.id, [
        { sourceType: 'BOTTLE', bottleId: rum.id },
        { sourceType: 'CATEGORY', categoryId: category.id, preferredBottleIds: [rum.id] },
        { sourceType: 'INGREDIENT', ingredientId: lime.id },
      ]);
    }
  }

  it('sends the same small number of queries for 1 and 20 cocktails', async () => {
    await seedCocktails(1);
    const forOne = await countQueries((db) => calculateAllCocktailsAvailability(db));
    await cleanDatabase();
    await seedRequiredData();
    await seedCocktails(20);
    const forTwenty = await countQueries((db) => calculateAllCocktailsAvailability(db));

    expect(forOne).toBeGreaterThan(0);
    expect(forTwenty).toBe(forOne);
    expect(forTwenty).toBeLessThanOrEqual(8);
  });

  it('sends no query for an empty list of cocktails', async () => {
    await seedCocktails(1);
    let result: Map<number, unknown> | undefined;
    const queries = await countQueries(async (db) => { result = await calculateAvailabilities(db, []); });

    expect(queries).toBe(0);
    expect(result?.size).toBe(0);
  });

  it('loads the recipe lines in position order, with their preferred bottles', async () => {
    await seedCocktails(1);
    const [cocktail] = await prisma.cocktail.findMany();

    const result = await calculateCocktailAvailability(cocktail.id);

    expect(result.ingredients.map((ingredient) => ingredient.sourceType)).toEqual(['BOTTLE', 'CATEGORY', 'INGREDIENT']);
    expect(result.ingredients[1].preferredAvailable).toBe(true);
    // The rum bottle counts in its own resource and in its category's: 700 ml / 10 ml each
    expect(result.maxServings).toBe(70);
  });
});

describe('calculateCocktailAvailability', () => {
  it('should throw a NotFoundError for non-existent cocktail', async () => {
    await expect(calculateCocktailAvailability(9999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should return 999 maxServings for cocktail with no ingredients', async () => {
    const cocktail = await prisma.cocktail.create({ data: { name: 'Empty' } });
    const result = await calculateCocktailAvailability(cocktail.id);
    expect(result.isAvailable).toBe(true);
    expect(result.maxServings).toBe(999);
    expect(result.ingredients).toHaveLength(0);
  });

  it('should convert cl to ml correctly for BOTTLE source', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    // 700ml bottle, 100% remaining = 700ml available
    const bottle = await seedBottle({ categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'CL Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle.id,
        unitId: unit.id, quantity: 5, position: 0, // 5cl = 50ml
      },
    });

    const result = await calculateCocktailAvailability(cocktail.id);
    // 700ml / 50ml = 14 servings
    expect(result.maxServings).toBe(14);
  });

  it('should handle CATEGORY source by summing all bottles', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    // Two bottles: 700ml + 350ml = 1050ml total
    await seedBottle({ name: 'B1', categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });
    await seedBottle({ name: 'B2', categoryId: cat.id, capacityMl: 700, remainingPercent: 50 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Cat Sum' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'CATEGORY', categoryId: cat.id,
        unitId: unit.id, quantity: 4, position: 0, // 4cl = 40ml
      },
    });

    const result = await calculateCocktailAvailability(cocktail.id);
    // (700 + 350) / 40 = 26 servings
    expect(result.maxServings).toBe(26);
  });

  it('should handle INGREDIENT source (available = unlimited)', async () => {
    const unit = await seedUnit();
    const ing = await seedIngredient({ name: 'Lime', isAvailable: true });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Ing Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'INGREDIENT', ingredientId: ing.id,
        unitId: unit.id, quantity: 1, position: 0,
      },
    });

    const result = await calculateCocktailAvailability(cocktail.id);
    expect(result.isAvailable).toBe(true);
    expect(result.maxServings).toBe(999); // unlimited
  });

  it('should handle unavailable INGREDIENT', async () => {
    const unit = await seedUnit();
    const ing = await seedIngredient({ name: 'Fresh Mint', isAvailable: false });

    const cocktail = await prisma.cocktail.create({ data: { name: 'No Mint' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'INGREDIENT', ingredientId: ing.id,
        unitId: unit.id, quantity: 1, position: 0,
      },
    });

    const result = await calculateCocktailAvailability(cocktail.id);
    expect(result.isAvailable).toBe(false);
    expect(result.maxServings).toBe(0);
    expect(result.missingIngredients).toContain('Fresh Mint');
  });

  it('should generate low stock warning for <= 3 servings', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    // 700ml * 10% = 70ml. 70ml / 40ml = 1 serving
    const bottle = await seedBottle({ categoryId: cat.id, capacityMl: 700, remainingPercent: 10 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Low' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle.id,
        unitId: unit.id, quantity: 4, position: 0,
      },
    });

    const result = await calculateCocktailAvailability(cocktail.id);
    expect(result.isAvailable).toBe(true);
    expect(result.maxServings).toBe(1);
    expect(result.lowStockWarnings.length).toBeGreaterThan(0);
    expect(result.lowStockWarnings[0]).toContain('1 servings');
  });
});

describe('calculateAllCocktailsAvailability', () => {
  it('should return empty object when no cocktails exist', async () => {
    const result = await calculateAllCocktailsAvailability();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should return availability for each cocktail', async () => {
    const c1 = await prisma.cocktail.create({ data: { name: 'C1' } });
    const c2 = await prisma.cocktail.create({ data: { name: 'C2' } });

    const result = await calculateAllCocktailsAvailability();
    expect(result[c1.id]).toBeDefined();
    expect(result[c2.id]).toBeDefined();
    expect(result[c1.id].cocktailId).toBe(c1.id);
  });
});
