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
  });
});
