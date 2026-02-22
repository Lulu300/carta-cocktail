import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  prisma, seedCategory, seedUnit, seedBottle, seedIngredient,
} from '../test/helpers';
import { calculateCocktailAvailability, calculateAllCocktailsAvailability } from './availabilityService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('calculateCocktailAvailability', () => {
  it('should throw for non-existent cocktail', async () => {
    await expect(calculateCocktailAvailability(9999)).rejects.toThrow('Cocktail not found');
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
