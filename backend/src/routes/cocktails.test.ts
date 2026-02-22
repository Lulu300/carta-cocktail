import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedUnit, seedBottle, seedIngredient, seedCocktail,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/cocktails', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/cocktails');
    expect(res.status).toBe(401);
  });

  it('should return all cocktails', async () => {
    await seedCocktail({ name: 'Mojito' });
    await seedCocktail({ name: 'Daiquiri' });

    const res = await request.get('/api/cocktails').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Sorted by name
    expect(res.body[0].name).toBe('Daiquiri');
    expect(res.body[1].name).toBe('Mojito');
  });
});

describe('GET /api/cocktails/:id', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/cocktails/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return cocktail with ingredients and instructions', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });

    const createRes = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Test Cocktail',
      ingredients: [{ quantity: 4, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id }],
      instructions: [{ text: 'Shake well' }],
    });

    const res = await request.get(`/api/cocktails/${createRes.body.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Cocktail');
    expect(res.body.ingredients).toHaveLength(1);
    expect(res.body.instructions).toHaveLength(1);
  });
});

describe('POST /api/cocktails', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/cocktails').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('should create a simple cocktail with no ingredients', async () => {
    const res = await request.post('/api/cocktails').set(authHeader())
      .send({ name: 'Simple' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Simple');
    expect(res.body.ingredients).toHaveLength(0);
  });

  it('should create with BOTTLE source ingredient', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Bottle Cocktail',
      ingredients: [{ quantity: 4, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id }],
    });
    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].sourceType).toBe('BOTTLE');
    expect(res.body.ingredients[0].bottleId).toBe(bottle.id);
  });

  it('should create with CATEGORY source ingredient', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Category Cocktail',
      ingredients: [{ quantity: 4, unitId: unit.id, sourceType: 'CATEGORY', categoryId: cat.id }],
    });
    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].sourceType).toBe('CATEGORY');
    expect(res.body.ingredients[0].categoryId).toBe(cat.id);
  });

  it('should create with INGREDIENT source', async () => {
    const unit = await seedUnit();
    const ing = await seedIngredient({ name: 'Lime Juice' });

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Ing Cocktail',
      ingredients: [{ quantity: 1, unitId: unit.id, sourceType: 'INGREDIENT', ingredientId: ing.id }],
    });
    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].sourceType).toBe('INGREDIENT');
  });

  it('should create with instructions', async () => {
    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Steps',
      instructions: [{ text: 'Muddle' }, { text: 'Shake' }, { text: 'Strain' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.instructions).toHaveLength(3);
    expect(res.body.instructions[0].stepNumber).toBe(1);
    expect(res.body.instructions[2].stepNumber).toBe(3);
  });

  it('should handle tags as array', async () => {
    const res = await request.post('/api/cocktails').set(authHeader())
      .send({ name: 'Tagged', tags: ['classic', 'fruity'] });
    expect(res.status).toBe(201);
    expect(res.body.tags).toBe('classic,fruity');
  });
});

describe('PUT /api/cocktails/:id', () => {
  it('should update cocktail name', async () => {
    const cocktail = await seedCocktail({ name: 'Old' });
    const res = await request.put(`/api/cocktails/${cocktail.id}`).set(authHeader())
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
  });

  it('should replace all ingredients when provided', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });

    const createRes = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Replace Test',
      ingredients: [{ quantity: 2, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id }],
    });

    const res = await request.put(`/api/cocktails/${createRes.body.id}`).set(authHeader()).send({
      ingredients: [
        { quantity: 3, unitId: unit.id, sourceType: 'CATEGORY', categoryId: cat.id },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.ingredients).toHaveLength(1);
    expect(res.body.ingredients[0].sourceType).toBe('CATEGORY');
  });
});

describe('DELETE /api/cocktails/:id', () => {
  it('should delete a cocktail', async () => {
    const cocktail = await seedCocktail();
    const res = await request.delete(`/api/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);
    const check = await prisma.cocktail.findUnique({ where: { id: cocktail.id } });
    expect(check).toBeNull();
  });
});

describe('GET /api/cocktails/:id/export', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/cocktails/9999/export').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return export payload with version=1', async () => {
    const cocktail = await seedCocktail({ name: 'Export Test' });
    const res = await request.get(`/api/cocktails/${cocktail.id}/export`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cocktail.name).toBe('Export Test');
    expect(res.headers['content-disposition']).toContain('cocktail-export-test.json');
  });
});

describe('POST /api/cocktails/import/preview', () => {
  it('should return 400 for invalid version', async () => {
    const res = await request.post('/api/cocktails/import/preview').set(authHeader())
      .send({ version: 2, cocktail: { name: 'Test' } });
    expect(res.status).toBe(400);
  });

  it('should return 400 for missing cocktail name', async () => {
    const res = await request.post('/api/cocktails/import/preview').set(authHeader())
      .send({ version: 1, cocktail: {} });
    expect(res.status).toBe(400);
  });

  it('should detect if cocktail name already exists', async () => {
    await seedCocktail({ name: 'Existing' });
    const res = await request.post('/api/cocktails/import/preview').set(authHeader())
      .send({ version: 1, cocktail: { name: 'Existing', ingredients: [], instructions: [] } });
    expect(res.status).toBe(200);
    expect(res.body.cocktail.alreadyExists).toBe(true);
  });

  it('should identify matched and missing entities', async () => {
    await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });

    const res = await request.post('/api/cocktails/import/preview').set(authHeader())
      .send({
        version: 1,
        cocktail: {
          name: 'New Import',
          ingredients: [
            {
              sourceType: 'CATEGORY',
              sourceName: 'Rum',
              sourceDetail: { type: 'SPIRIT' },
              quantity: 4,
              unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
              position: 0,
              preferredBottles: [],
            },
          ],
          instructions: [],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.cocktail.alreadyExists).toBe(false);
    // cl should be matched, Rum category should be missing
    expect(res.body.units[0].status).toBe('matched');
    expect(res.body.categories[0].status).toBe('missing');
  });
});
