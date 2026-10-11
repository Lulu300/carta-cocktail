import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../config';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedUnit, seedBottle, seedIngredient, seedCocktail,
  seedFullCocktail,
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
    const cocktail = await seedFullCocktail({ name: 'Test Cocktail' });

    const res = await request.get(`/api/cocktails/${cocktail.id}`).set(authHeader());
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

  it('should return 400 for a BOTTLE line without bottleId', async () => {
    const unit = await seedUnit();

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Broken',
      ingredients: [{ quantity: 4, unitId: unit.id, sourceType: 'BOTTLE' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.0.bottleId', code: 'custom' });
    expect(await prisma.cocktail.count()).toBe(0);
  });

  it('should return 400 for an unknown sourceType', async () => {
    const unit = await seedUnit();

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Broken',
      ingredients: [{ quantity: 4, unitId: unit.id, sourceType: 'GARNISH' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.ingredients.0.sourceType');
  });

  it('should return 400 for a line with a quantity of 0', async () => {
    const unit = await seedUnit();
    const bottle = await seedBottle();

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Broken',
      ingredients: [{ quantity: 0, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.0.quantity', code: 'too_small' });
    expect(await prisma.cocktail.count()).toBe(0);
  });

  it('should return 400 for an instruction with an empty text', async () => {
    const res = await request.post('/api/cocktails').set(authHeader())
      .send({ name: 'Steps', instructions: [{ text: '' }] });
    expect(res.status).toBe(400);
    expect(await prisma.cocktail.count()).toBe(0);
  });

  it('should accept instructions sent as plain strings', async () => {
    const res = await request.post('/api/cocktails').set(authHeader())
      .send({ name: 'Steps', instructions: ['Muddle', { text: 'Shake' }] });
    expect(res.status).toBe(201);
    expect(res.body.instructions.map((i: { text: string }) => i.text)).toEqual(['Muddle', 'Shake']);
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

  // Full recipe: a BOTTLE ingredient, a CATEGORY ingredient with a preferred bottle,
  // two instructions and two tags.
  async function createFullCocktail() {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });
    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Full Recipe',
      tags: ['rhum', 'frais'],
      ingredients: [
        { quantity: 4, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id },
        {
          quantity: 2, unitId: unit.id, sourceType: 'CATEGORY', categoryId: cat.id,
          preferredBottleIds: [bottle.id],
        },
      ],
      instructions: [{ text: 'Shake' }, { text: 'Strain' }],
    });
    expect(res.status).toBe(201);
    return { id: res.body.id as number, unit };
  }

  function expectRecipeIntact(body: any) {
    expect(body.ingredients).toHaveLength(2);
    expect(body.ingredients[0].sourceType).toBe('BOTTLE');
    expect(body.ingredients[1].preferredBottles).toHaveLength(1);
    expect(body.instructions.map((i: any) => i.text)).toEqual(['Shake', 'Strain']);
  }

  it('should keep ingredients, instructions, tags and preferred bottles on a partial update', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);
    expect(res.body.tags).toBe('rhum,frais');
    expectRecipeIntact(res.body);
  });

  it('should keep tags when only the name is updated', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ name: 'X' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('X');
    expect(res.body.tags).toBe('rhum,frais');
  });

  it('should clear tags when an empty array is sent', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.tags).toBe('');
  });

  it('should clear tags when null is sent', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ tags: null });

    expect(res.status).toBe(200);
    expect(res.body.tags).toBe('');
  });

  it('should clear ingredients but keep instructions when ingredients is an empty array', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ ingredients: [] });

    expect(res.status).toBe(200);
    expect(res.body.ingredients).toHaveLength(0);
    expect(res.body.instructions).toHaveLength(2);
    expect(await prisma.cocktailPreferredBottle.count()).toBe(0);
  });

  it('should return 400 and leave the recipe untouched when a unit does not exist', async () => {
    const { id } = await createFullCocktail();
    const lime = await seedIngredient({ name: 'Lime' });

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({
      name: 'Should Not Be Saved',
      ingredients: [{ quantity: 1, unitId: 99999, sourceType: 'INGREDIENT', ingredientId: lime.id }],
      instructions: [{ text: 'Replaced' }],
    });
    expect(res.status).toBe(400);

    const after = await request.get(`/api/cocktails/${id}`).set(authHeader());
    expect(after.body.name).toBe('Full Recipe');
    expectRecipeIntact(after.body);
  });

  it('should return 400 and leave the recipe untouched when a preferred bottle does not exist', async () => {
    const { id, unit } = await createFullCocktail();
    const cat = await seedCategory({ name: 'Other' });

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({
      ingredients: [{
        quantity: 1, unitId: unit.id, sourceType: 'CATEGORY', categoryId: cat.id,
        preferredBottleIds: [99999],
      }],
    });
    expect(res.status).toBe(400);

    const after = await request.get(`/api/cocktails/${id}`).set(authHeader());
    expectRecipeIntact(after.body);
  });

  it('should return 404 for a non-existent cocktail', async () => {
    const res = await request.put('/api/cocktails/99999').set(authHeader()).send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('should return 400 and leave the recipe untouched for a BOTTLE line without bottleId', async () => {
    const { id, unit } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({
      ingredients: [{ quantity: 1, unitId: unit.id, sourceType: 'BOTTLE', bottleId: null }],
    });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.0.bottleId', code: 'custom' });

    const after = await request.get(`/api/cocktails/${id}`).set(authHeader());
    expectRecipeIntact(after.body);
  });

  it('should return 400 for an instruction with an empty text', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ instructions: [{ text: '' }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.instructions.0');

    const after = await request.get(`/api/cocktails/${id}`).set(authHeader());
    expectRecipeIntact(after.body);
  });

  it('should return 400 and leave the recipe untouched for a non-string instruction', async () => {
    const { id } = await createFullCocktail();

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ instructions: [{ text: 42 }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.instructions.0');

    const after = await request.get(`/api/cocktails/${id}`).set(authHeader());
    expectRecipeIntact(after.body);
  });
});

// Recipes stored before v1.9.0 can hold lines whose source was deleted (key set to NULL
// until v1.7.0) or with a quantity of 0 (a cleared field). The form sends them back as they are.
describe('PUT /api/cocktails/:id - recipe defects already stored', () => {
  type StoredLine = {
    sourceType: 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
    quantity: number;
    bottleId?: number;
    categoryId?: number;
    ingredientId?: number;
  };

  async function seedLegacyCocktail(line: StoredLine) {
    const unit = await seedUnit();
    const cocktail = await prisma.cocktail.create({
      data: { name: 'Legacy', ingredients: { create: [{ ...line, unitId: unit.id, position: 0 }] } },
    });
    return { id: cocktail.id, unitId: unit.id };
  }

  // The recipe lines as CocktailFormPage loads them and sends them back on save
  async function formLines(id: number) {
    const res = await request.get(`/api/cocktails/${id}`).set(authHeader());
    return res.body.ingredients.map((ing: any) => ({
      sourceType: ing.sourceType,
      bottleId: ing.sourceType === 'BOTTLE' ? ing.bottleId : null,
      categoryId: ing.sourceType === 'CATEGORY' ? ing.categoryId : null,
      ingredientId: ing.sourceType === 'INGREDIENT' ? ing.ingredientId : null,
      quantity: ing.quantity,
      unitId: ing.unitId,
      preferredBottleIds: ing.sourceType === 'CATEGORY' ? [] : undefined,
    }));
  }

  async function storedLines(id: number) {
    return prisma.cocktailIngredient.findMany({ where: { cocktailId: id }, orderBy: { position: 'asc' } });
  }

  it.each(['BOTTLE', 'CATEGORY', 'INGREDIENT'] as const)(
    'should rename a cocktail whose %s line lost its source and keep the line',
    async (sourceType) => {
      const { id } = await seedLegacyCocktail({ sourceType, quantity: 2 });

      const ingredients = await formLines(id);
      const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
        .send({ name: 'Renamed', ingredients });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
      expect(await storedLines(id)).toMatchObject([
        { sourceType, bottleId: null, categoryId: null, ingredientId: null, quantity: 2 },
      ]);
    },
  );

  it('should rename a cocktail with a quantity-0 line and keep the line', async () => {
    const bottle = await seedBottle();
    const { id } = await seedLegacyCocktail({ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 0 });

    const ingredients = await formLines(id);
    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ name: 'Renamed', ingredients });
    expect(res.status).toBe(200);
    expect(await storedLines(id)).toMatchObject([{ bottleId: bottle.id, quantity: 0 }]);
  });

  it('should return 400 and keep the recipe when a new line lost its source', async () => {
    const { id, unitId } = await seedLegacyCocktail({ sourceType: 'BOTTLE', quantity: 2 });
    const newLine = { sourceType: 'BOTTLE', bottleId: null, quantity: 1, unitId };

    const ingredients = [...await formLines(id), newLine];
    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ ingredients });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      { path: 'body.ingredients.1.bottleId', code: 'custom', message: 'Required when sourceType is BOTTLE' },
    ]);
    expect(await storedLines(id)).toHaveLength(1);
  });

  it('should return 400 and keep the recipe when a new line has a quantity of 0', async () => {
    const bottle = await seedBottle();
    const { id, unitId } = await seedLegacyCocktail({ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 0 });
    const newLine = { sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 0, unitId };

    const ingredients = [...await formLines(id), newLine];
    const res = await request.put(`/api/cocktails/${id}`).set(authHeader()).send({ ingredients });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(1);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.1.quantity', code: 'too_small' });
    expect(await storedLines(id)).toHaveLength(1);
  });

  it('should return 400 for a line without source on a cocktail that has no stored defect', async () => {
    const bottle = await seedBottle();
    const { id, unitId } = await seedLegacyCocktail({ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 2 });

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ ingredients: [{ sourceType: 'INGREDIENT', ingredientId: null, quantity: 1, unitId }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.0.ingredientId', code: 'custom' });
    expect(await storedLines(id)).toMatchObject([{ bottleId: bottle.id }]);
  });

  it('should return 400 for a quantity of 0 on a cocktail that has no stored defect', async () => {
    const bottle = await seedBottle();
    const { id, unitId } = await seedLegacyCocktail({ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 2 });

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ ingredients: [{ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 0, unitId }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ path: 'body.ingredients.0.quantity', code: 'too_small' });
    expect(await storedLines(id)).toMatchObject([{ quantity: 2 }]);
  });

  it('should still return 400 for a negative quantity on a cocktail with a quantity-0 line', async () => {
    const bottle = await seedBottle();
    const { id, unitId } = await seedLegacyCocktail({ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 0 });

    const res = await request.put(`/api/cocktails/${id}`).set(authHeader())
      .send({ ingredients: [{ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: -1, unitId }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.ingredients.0.quantity');
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

describe('GET /api/cocktails/:id/export - rich data with all source types', () => {
  it('should export BOTTLE, CATEGORY, and INGREDIENT ingredients with tags, description, notes, preferredBottles', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    const bottle = await seedBottle({ name: 'Havana 3 Ans', categoryId: cat.id });
    const ing = await seedIngredient({ name: 'Lime Juice' });

    // Create cocktail via API so all relations are created properly
    const createRes = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Rich Export',
      description: 'A great cocktail',
      notes: 'Shake hard',
      tags: ['classic', 'fruity'],
      ingredients: [
        { quantity: 4, unitId: unit.id, sourceType: 'BOTTLE', bottleId: bottle.id },
        { quantity: 2, unitId: unit.id, sourceType: 'CATEGORY', categoryId: cat.id, preferredBottleIds: [bottle.id] },
        { quantity: 1, unitId: unit.id, sourceType: 'INGREDIENT', ingredientId: ing.id },
      ],
      instructions: [{ text: 'Shake' }],
    });
    expect(createRes.status).toBe(201);

    const res = await request.get(`/api/cocktails/${createRes.body.id}/export`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cocktail.description).toBe('A great cocktail');
    expect(res.body.cocktail.notes).toBe('Shake hard');
    expect(res.body.cocktail.tags).toEqual(['classic', 'fruity']);

    const ings = res.body.cocktail.ingredients;
    expect(ings).toHaveLength(3);

    // BOTTLE branch
    const bottleIng = ings.find((i: any) => i.sourceType === 'BOTTLE');
    expect(bottleIng).toBeDefined();
    expect(bottleIng.sourceName).toBe('Havana 3 Ans');
    expect(bottleIng.sourceDetail.categoryName).toBe('Rum');
    expect(bottleIng.sourceDetail.categoryType).toBe('SPIRIT');

    // CATEGORY branch
    const catIng = ings.find((i: any) => i.sourceType === 'CATEGORY');
    expect(catIng).toBeDefined();
    expect(catIng.sourceName).toBe('Rum');
    expect(catIng.sourceDetail.type).toBe('SPIRIT');
    expect(catIng.preferredBottles).toHaveLength(1);
    expect(catIng.preferredBottles[0].name).toBe('Havana 3 Ans');

    // INGREDIENT branch
    const ingIng = ings.find((i: any) => i.sourceType === 'INGREDIENT');
    expect(ingIng).toBeDefined();
    expect(ingIng.sourceName).toBe('Lime Juice');
    expect(ingIng.sourceDetail).toHaveProperty('icon');
  });
});

describe('POST /api/cocktails/import/confirm', () => {
  it('should return 400 for invalid payload', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader())
      .send({ recipe: { version: 2, cocktail: { name: 'X' } }, resolutions: {} });
    expect(res.status).toBe(400);
  });

  it('should create cocktail with use_existing resolutions', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });
    const cat = await seedCategory({ name: 'Rum', type: 'SPIRIT' });

    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Import Confirm Test',
          description: 'Imported',
          notes: 'Good',
          tags: ['tropical'],
          ingredients: [
            {
              sourceType: 'CATEGORY',
              sourceName: 'Rum',
              sourceDetail: { type: 'SPIRIT', desiredStock: 1 },
              quantity: 4,
              unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
              position: 0,
              preferredBottles: [],
            },
          ],
          instructions: [{ text: 'Mix it', stepNumber: 1 }],
        },
      },
      resolutions: {
        units: {
          cl: { action: 'use_existing', existingId: unit.id },
        },
        categories: {
          rum: { action: 'use_existing', existingId: cat.id },
        },
        bottles: {},
        ingredients: {},
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Import Confirm Test');
    expect(res.body.description).toBe('Imported');
    expect(res.body.tags).toBe('tropical');
    expect(res.body.ingredients).toHaveLength(1);
    expect(res.body.ingredients[0].sourceType).toBe('CATEGORY');
    expect(res.body.ingredients[0].categoryId).toBe(cat.id);
    expect(res.body.instructions).toHaveLength(1);
  });

  it('should create cocktail with create resolutions (new unit + new category with auto categoryType)', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Full Create Import',
          description: null,
          notes: null,
          tags: [],
          ingredients: [
            {
              sourceType: 'CATEGORY',
              sourceName: 'Tequila',
              sourceDetail: { type: 'CUSTOM_AGAVE', desiredStock: 2 },
              quantity: 5,
              unit: { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 },
              position: 0,
              preferredBottles: [],
            },
          ],
          instructions: [],
        },
      },
      resolutions: {
        units: {
          ml: {
            action: 'create',
            data: { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1, nameTranslations: null },
          },
        },
        categories: {
          tequila: {
            action: 'create',
            data: { name: 'Tequila', type: 'CUSTOM_AGAVE', desiredStock: 2, nameTranslations: null },
          },
        },
        bottles: {},
        ingredients: {},
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Full Create Import');
    expect(res.body.ingredients[0].sourceType).toBe('CATEGORY');

    // Verify auto-created categoryType
    const { prisma: testPrisma } = await import('../test/helpers');
    const catType = await testPrisma.categoryType.findUnique({ where: { name: 'CUSTOM_AGAVE' } });
    expect(catType).not.toBeNull();
    expect(catType!.color).toBe('gray');
  });

  it('should ignore id, createdAt and purchasePrice slipped into resolution data', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Mass Assignment',
          ingredients: [
            {
              sourceType: 'BOTTLE',
              sourceName: 'Havana',
              sourceDetail: { categoryName: 'Rum', categoryType: 'SPIRIT' },
              quantity: 4,
              unit: { name: 'u', abbreviation: 'u2' },
            },
          ],
        },
      },
      resolutions: {
        units: {
          u2: { action: 'create', data: { id: 999, name: 'u', abbreviation: 'u2' } },
        },
        categories: {
          rum: { action: 'create', data: { id: 998, name: 'Rum', createdAt: '2000-01-01T00:00:00.000Z' } },
        },
        bottles: {
          havana: {
            action: 'create',
            data: { id: 997, name: 'Havana', categoryName: 'Rum', capacityMl: 700, purchasePrice: 1234 },
          },
        },
        ingredients: {},
      },
    });

    expect(res.status).toBe(201);
    const unit = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: 'u2' } });
    expect(unit.id).not.toBe(999);
    const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Rum' } });
    expect(category.id).not.toBe(998);
    expect(category.type).toBe('SPIRIT');
    expect(category.createdAt.getFullYear()).not.toBe(2000);
    const bottle = await prisma.bottle.findFirstOrThrow({ where: { name: 'Havana' } });
    expect(bottle.id).not.toBe(997);
    expect(bottle.purchasePrice).toBeNull();
    expect(res.body.ingredients[0].bottleId).toBe(bottle.id);
  });

  it('should fall back on the names of the file when the admin clears them in the wizard', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Blank Names',
          ingredients: [
            {
              sourceType: 'BOTTLE',
              sourceName: 'Havana Club',
              sourceDetail: { categoryName: 'Rhum Ambré', categoryType: 'SPIRIT' },
              quantity: 4,
              unit: { name: 'Centilitre', abbreviation: 'cL' },
            },
            {
              sourceType: 'INGREDIENT',
              sourceName: 'Citron Vert',
              quantity: 1,
              unit: { name: 'Centilitre', abbreviation: 'cL' },
            },
          ],
        },
      },
      resolutions: {
        units: { cl: { action: 'create', data: { name: '', abbreviation: '  ' } } },
        categories: { 'rhum ambré': { action: 'create', data: { name: ' ', type: 'SPIRIT' } } },
        bottles: { 'havana club': { action: 'create', data: { name: '', categoryName: 'Rhum Ambré', capacityMl: 700 } } },
        ingredients: { 'citron vert': { action: 'create', data: { name: '' } } },
      },
    });

    expect(res.status).toBe(201);
    const unit = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: 'cL' } });
    expect(unit.name).toBe('Centilitre');
    expect(await prisma.category.findUnique({ where: { name: 'Rhum Ambré' } })).not.toBeNull();
    expect(await prisma.bottle.findFirst({ where: { name: 'Havana Club' } })).not.toBeNull();
    expect(await prisma.ingredient.findUnique({ where: { name: 'Citron Vert' } })).not.toBeNull();
  });

  it('should name a unit after its abbreviation when neither the admin nor the file gives a name', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Hand Made',
          ingredients: [
            { sourceType: 'CATEGORY', sourceName: 'Rum', quantity: 4, unit: { abbreviation: 'Dash' } },
          ],
        },
      },
      resolutions: {
        units: { dash: { action: 'create', data: { name: '' } } },
        categories: { rum: { action: 'create', data: { name: 'Rum' } } },
      },
    });

    expect(res.status).toBe(201);
    const unit = await prisma.unit.findUniqueOrThrow({ where: { abbreviation: 'Dash' } });
    expect(unit.name).toBe('Dash');
    expect(res.body.ingredients[0].unitId).toBe(unit.id);
  });

  it('should return 400 for a created bottle with remainingPercent above 100', async () => {
    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: { version: 1, cocktail: { name: 'Bounds' } },
      resolutions: {
        bottles: {
          havana: { action: 'create', data: { name: 'Havana', categoryName: 'Rum', capacityMl: 700, remainingPercent: 150 } },
        },
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.resolutions.bottles.havana.data.remainingPercent');
    expect(await prisma.cocktail.count()).toBe(0);
  });

  it('should create cocktail with INGREDIENT resolution via create', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });

    const res = await request.post('/api/cocktails/import/confirm').set(authHeader()).send({
      recipe: {
        version: 1,
        cocktail: {
          name: 'Ingredient Import',
          description: null,
          notes: null,
          tags: [],
          ingredients: [
            {
              sourceType: 'INGREDIENT',
              sourceName: 'Fresh Mint',
              sourceDetail: { icon: null, nameTranslations: null },
              quantity: 3,
              unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
              position: 0,
              preferredBottles: [],
            },
          ],
          instructions: [],
        },
      },
      resolutions: {
        units: {
          cl: { action: 'use_existing', existingId: unit.id },
        },
        categories: {},
        bottles: {},
        ingredients: {
          'fresh mint': {
            action: 'create',
            data: { name: 'Fresh Mint', icon: null, nameTranslations: null },
          },
        },
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].sourceType).toBe('INGREDIENT');
    expect(res.body.ingredients[0].ingredient.name).toBe('Fresh Mint');
  });
});

describe('POST /api/cocktails - with preferredBottleIds', () => {
  it('should create ingredient with preferredBottles array', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });

    const res = await request.post('/api/cocktails').set(authHeader()).send({
      name: 'Preferred Bottles Test',
      ingredients: [
        {
          quantity: 3,
          unitId: unit.id,
          sourceType: 'CATEGORY',
          categoryId: cat.id,
          preferredBottleIds: [bottle.id],
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.ingredients[0].preferredBottles).toHaveLength(1);
    expect(res.body.ingredients[0].preferredBottles[0].bottleId).toBe(bottle.id);
  });
});

describe('PUT /api/cocktails/:id - full data update', () => {
  it('should update with tags as string, isAvailable false, and preferredBottleIds', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id });
    const cocktail = await seedCocktail({ name: 'Update Target' });

    const res = await request.put(`/api/cocktails/${cocktail.id}`).set(authHeader()).send({
      name: 'Updated Name',
      description: 'Updated desc',
      notes: 'Updated notes',
      tags: 'sour,citrus',
      isAvailable: false,
      ingredients: [
        {
          quantity: 2,
          unitId: unit.id,
          sourceType: 'CATEGORY',
          categoryId: cat.id,
          preferredBottleIds: [bottle.id],
        },
      ],
      instructions: [{ text: 'Step 1' }, { text: 'Step 2' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.description).toBe('Updated desc');
    expect(res.body.notes).toBe('Updated notes');
    expect(res.body.tags).toBe('sour,citrus');
    expect(res.body.isAvailable).toBe(false);
    expect(res.body.ingredients).toHaveLength(1);
    expect(res.body.ingredients[0].preferredBottles).toHaveLength(1);
    expect(res.body.instructions).toHaveLength(2);
    expect(res.body.instructions[1].stepNumber).toBe(2);
  });
});

describe('DELETE /api/cocktails/:id - with imagePath set', () => {
  it('should delete cocktail that has imagePath without error (file absent branch)', async () => {
    const cocktail = await seedCocktail({ name: 'Image Cocktail' });

    // Manually set imagePath so the delete branch is exercised (file won't exist on disk)
    await prisma.cocktail.update({
      where: { id: cocktail.id },
      data: { imagePath: 'nonexistent-image-12345.jpg' },
    });

    const res = await request.delete(`/api/cocktails/${cocktail.id}`).set(authHeader());
    expect(res.status).toBe(200);

    const check = await prisma.cocktail.findUnique({ where: { id: cocktail.id } });
    expect(check).toBeNull();
  });
});

describe('POST /api/cocktails/:id/image - upload replacing existing', () => {
  it('should return 400 when no file is uploaded', async () => {
    const cocktail = await seedCocktail({ name: 'No Image Cocktail' });
    const res = await request.post(`/api/cocktails/${cocktail.id}/image`).set(authHeader());
    expect(res.status).toBe(400);
  });

  it('should upload image and cover existing imagePath replacement branch', async () => {
    const cocktail = await seedCocktail({ name: 'Replace Image Cocktail' });

    // Set a fake existing imagePath (file won't exist on disk, branch still runs)
    await prisma.cocktail.update({
      where: { id: cocktail.id },
      data: { imagePath: 'old-image-99999.jpg' },
    });

    const res = await request
      .post(`/api/cocktails/${cocktail.id}/image`)
      .set(authHeader())
      .attach('image', Buffer.from('fake-png-data'), { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.imagePath).toBeDefined();
    expect(res.body.imagePath).not.toBe('old-image-99999.jpg');
    // The upload must land in the temporary test folder, never in <repo>/uploads
    expect(config.uploadDir.startsWith(os.tmpdir())).toBe(true);
    expect(fs.existsSync(path.join(config.uploadDir, res.body.imagePath))).toBe(true);
  });

  it('should delete the previous image file from disk when a new one is uploaded', async () => {
    const cocktail = await seedCocktail({ name: 'Old File Cocktail' });
    const oldFileName = 'old-image-on-disk.png';
    const oldFilePath = path.join(config.uploadDir, oldFileName);
    fs.writeFileSync(oldFilePath, 'old-png-data');
    await prisma.cocktail.update({
      where: { id: cocktail.id },
      data: { imagePath: oldFileName },
    });

    const res = await request
      .post(`/api/cocktails/${cocktail.id}/image`)
      .set(authHeader())
      .attach('image', Buffer.from('new-png-data'), { filename: 'new.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(fs.existsSync(oldFilePath)).toBe(false);
    expect(fs.existsSync(path.join(config.uploadDir, res.body.imagePath))).toBe(true);
  });
});
