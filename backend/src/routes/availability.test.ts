import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedUnit, seedBottle, seedIngredient,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/availability/cocktails/:id', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/availability/cocktails/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return availability for cocktail with no ingredients', async () => {
    const cocktail = await prisma.cocktail.create({ data: { name: 'Empty' } });
    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);
    expect(res.body.maxServings).toBe(999);
    expect(res.body.ingredients).toHaveLength(0);
  });

  it('should calculate availability for BOTTLE source', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Bottle Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle.id,
        unitId: unit.id, quantity: 4, position: 0,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);
    // 700ml / 40ml = 17 servings
    expect(res.body.maxServings).toBe(17);
  });

  it('should calculate availability for CATEGORY source', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    await seedBottle({ name: 'B1', categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Category Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'CATEGORY', categoryId: cat.id,
        unitId: unit.id, quantity: 4, position: 0,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);
    expect(res.body.maxServings).toBe(17);
  });

  it('should calculate availability for INGREDIENT source', async () => {
    const unit = await seedUnit();
    const ing = await seedIngredient({ name: 'Lime', isAvailable: true });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Ingredient Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'INGREDIENT', ingredientId: ing.id,
        unitId: unit.id, quantity: 1, position: 0,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);
    // Ingredient availability is unlimited when available
    expect(res.body.maxServings).toBe(999);
  });

  it('should report unavailable when ingredient is marked unavailable', async () => {
    const unit = await seedUnit();
    const ing = await seedIngredient({ name: 'Mint', isAvailable: false });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Unavailable Test' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'INGREDIENT', ingredientId: ing.id,
        unitId: unit.id, quantity: 1, position: 0,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);
    expect(res.body.maxServings).toBe(0);
    expect(res.body.missingIngredients).toContain('Mint');
  });

  it('should report low stock warnings for <= 3 servings', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    // Only 90ml remaining = 2 servings of 4cl
    const bottle = await seedBottle({ categoryId: cat.id, capacityMl: 700, remainingPercent: 13 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Low Stock' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle.id,
        unitId: unit.id, quantity: 4, position: 0,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);
    expect(res.body.lowStockWarnings.length).toBeGreaterThan(0);
  });

  it('should use min servings across multiple ingredients', async () => {
    const unit = await seedUnit({ abbreviation: 'cl', conversionFactorToMl: 10 });
    const cat = await seedCategory();
    // Bottle 1: 700ml / 40ml = 17 servings
    const bottle1 = await seedBottle({ name: 'Full', categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });
    // Bottle 2: 140ml / 40ml = 3 servings (limiting factor)
    const bottle2 = await seedBottle({ name: 'Low', categoryId: cat.id, capacityMl: 700, remainingPercent: 20 });

    const cocktail = await prisma.cocktail.create({ data: { name: 'Multi Ing' } });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle1.id,
        unitId: unit.id, quantity: 4, position: 0,
      },
    });
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle2.id,
        unitId: unit.id, quantity: 4, position: 1,
      },
    });

    const res = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    // maxServings = min(17, 3) = 3
    expect(res.body.maxServings).toBe(3);
  });
});

describe('GET /api/availability/cocktails', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/availability/cocktails');
    expect(res.status).toBe(401);
  });

  it('should return availability for all cocktails', async () => {
    const c1 = await prisma.cocktail.create({ data: { name: 'C1' } });
    const c2 = await prisma.cocktail.create({ data: { name: 'C2' } });

    const res = await request.get('/api/availability/cocktails').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body[c1.id]).toBeDefined();
    expect(res.body[c2.id]).toBeDefined();
    expect(res.body[c1.id].isAvailable).toBe(true);
  });
});
