import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCocktail, seedCategory, seedBottle, seedUnit, seedIngredient,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/public/menus', () => {
  it('should return empty array when no menus are public', async () => {
    const res = await request.get('/api/public/menus');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return only public menus', async () => {
    await prisma.menu.create({
      data: { name: 'Public Menu', slug: 'public-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Public Menu');
  });
});

describe('GET /api/public/menus/:slug', () => {
  it('should return 404 for non-existent menu', async () => {
    const res = await request.get('/api/public/menus/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-public menu without auth', async () => {
    // aperitifs is seeded as isPublic: false
    const res = await request.get('/api/public/menus/aperitifs');
    expect(res.status).toBe(404);
  });

  it('should allow admin preview of non-public menu', async () => {
    const res = await request.get('/api/public/menus/aperitifs').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('aperitifs');
  });

  it('should return public menu with sections, cocktails, bottles', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Open Menu', slug: 'open-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus/open-menu');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sections');
    expect(res.body).toHaveProperty('cocktails');
    expect(res.body).toHaveProperty('bottles');
  });
});

describe('GET /api/public/settings', () => {
  it('should return site settings without auth', async () => {
    const res = await request.get('/api/public/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('siteName');
    expect(res.body).toHaveProperty('siteIcon');
  });
});

describe('GET /api/public/cocktails/:id', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999');
    expect(res.status).toBe(404);
  });

  it('should return cocktail with ingredients and instructions', async () => {
    const cocktail = await seedCocktail({ name: 'Public Mojito' });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Public Mojito');
  });
});

describe('GET /api/public/cocktails/:id/export', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999/export');
    expect(res.status).toBe(404);
  });

  it('should return export payload with version=1', async () => {
    const cocktail = await seedCocktail({ name: 'Export Public' });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cocktail.name).toBe('Export Public');
    expect(res.headers['content-disposition']).toContain('cocktail-export-public.json');
  });
});

describe('GET /api/public/cocktails/:id/export - all 3 source types', () => {
  it('should map BOTTLE, CATEGORY, and INGREDIENT source types correctly', async () => {
    const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });
    const category = await seedCategory({
      name: 'Rum',
      type: 'SPIRIT',
      desiredStock: 2,
      nameTranslations: JSON.stringify({ en: 'Rum', fr: 'Rhum' }),
    });
    const bottle = await seedBottle({
      name: 'Havana Club 3 ans',
      categoryId: category.id,
    });
    const ingredient = await seedIngredient({
      name: 'Fresh Lime Juice',
      icon: 'lime',
      nameTranslations: JSON.stringify({ en: 'Fresh Lime Juice', fr: 'Jus de citron vert' }),
    });

    const cocktail = await prisma.cocktail.create({
      data: {
        name: 'Rich Mojito',
        description: 'A classic mojito',
        notes: 'Shake well',
        tags: 'classic,fruity',
      },
    });

    // BOTTLE ingredient at position 0
    const bottleIng = await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'BOTTLE',
        bottleId: bottle.id,
        quantity: 5,
        unitId: unit.id,
        position: 0,
      },
    });

    // CATEGORY ingredient at position 1 (with a preferred bottle)
    const categoryIng = await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'CATEGORY',
        categoryId: category.id,
        quantity: 2,
        unitId: unit.id,
        position: 1,
      },
    });

    // Preferred bottle on the CATEGORY ingredient
    await prisma.cocktailPreferredBottle.create({
      data: {
        cocktailIngredientId: categoryIng.id,
        bottleId: bottle.id,
      },
    });

    // INGREDIENT ingredient at position 2
    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'INGREDIENT',
        ingredientId: ingredient.id,
        quantity: 3,
        unitId: unit.id,
        position: 2,
      },
    });

    // Add an instruction
    await prisma.cocktailInstruction.create({
      data: { cocktailId: cocktail.id, stepNumber: 1, text: 'Muddle the lime.' },
    });

    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);

    const c = res.body.cocktail;
    expect(c.name).toBe('Rich Mojito');
    expect(c.description).toBe('A classic mojito');
    expect(c.notes).toBe('Shake well');
    // Tags parsed from comma-separated string
    expect(c.tags).toEqual(['classic', 'fruity']);

    // Instructions mapped
    expect(c.instructions).toHaveLength(1);
    expect(c.instructions[0].stepNumber).toBe(1);
    expect(c.instructions[0].text).toBe('Muddle the lime.');

    // Find the BOTTLE ingredient
    const bottleIngResult = c.ingredients.find((i: any) => i.sourceType === 'BOTTLE');
    expect(bottleIngResult).toBeDefined();
    expect(bottleIngResult.sourceName).toBe('Havana Club 3 ans');
    expect(bottleIngResult.sourceDetail.categoryName).toBe('Rum');
    expect(bottleIngResult.sourceDetail.categoryType).toBe('SPIRIT');

    // Find the CATEGORY ingredient
    const categoryIngResult = c.ingredients.find((i: any) => i.sourceType === 'CATEGORY');
    expect(categoryIngResult).toBeDefined();
    expect(categoryIngResult.sourceName).toBe('Rum');
    expect(categoryIngResult.sourceDetail.type).toBe('SPIRIT');
    expect(categoryIngResult.sourceDetail.desiredStock).toBe(2);
    // Preferred bottles mapped
    expect(categoryIngResult.preferredBottles).toHaveLength(1);
    expect(categoryIngResult.preferredBottles[0].name).toBe('Havana Club 3 ans');
    expect(categoryIngResult.preferredBottles[0].categoryName).toBe('Rum');

    // Find the INGREDIENT ingredient
    const ingredientIngResult = c.ingredients.find((i: any) => i.sourceType === 'INGREDIENT');
    expect(ingredientIngResult).toBeDefined();
    expect(ingredientIngResult.sourceName).toBe('Fresh Lime Juice');
    expect(ingredientIngResult.sourceDetail.icon).toBe('lime');
  });
});

describe('GET /api/public/cocktails/:id - rich data with all source types', () => {
  it('should return cocktail with BOTTLE, CATEGORY, and INGREDIENT ingredients', async () => {
    const unit = await seedUnit({ name: 'Millilitre', abbreviation: 'ml' });
    const category = await seedCategory({ name: 'Gin', type: 'SPIRIT' });
    const bottle = await seedBottle({ name: 'Hendricks', categoryId: category.id });
    const ingredient = await seedIngredient({ name: 'Tonic Water', icon: 'tonic' });

    const cocktail = await prisma.cocktail.create({
      data: { name: 'Gin Tonic Deluxe', tags: '' },
    });

    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'BOTTLE',
        bottleId: bottle.id,
        quantity: 5,
        unitId: unit.id,
        position: 0,
      },
    });

    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'CATEGORY',
        categoryId: category.id,
        quantity: 1,
        unitId: unit.id,
        position: 1,
      },
    });

    await prisma.cocktailIngredient.create({
      data: {
        cocktailId: cocktail.id,
        sourceType: 'INGREDIENT',
        ingredientId: ingredient.id,
        quantity: 15,
        unitId: unit.id,
        position: 2,
      },
    });

    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Gin Tonic Deluxe');

    const ingredients = res.body.ingredients;
    expect(ingredients).toHaveLength(3);

    const bottleIng = ingredients.find((i: any) => i.sourceType === 'BOTTLE');
    expect(bottleIng).toBeDefined();
    expect(bottleIng.bottle.name).toBe('Hendricks');

    const categoryIng = ingredients.find((i: any) => i.sourceType === 'CATEGORY');
    expect(categoryIng).toBeDefined();
    expect(categoryIng.category.name).toBe('Gin');

    const ingredientIng = ingredients.find((i: any) => i.sourceType === 'INGREDIENT');
    expect(ingredientIng).toBeDefined();
    expect(ingredientIng.ingredient.name).toBe('Tonic Water');
  });
});

describe('GET /api/public/menus/:slug - menu with cocktails and bottles', () => {
  it('should return public menu with cocktails and bottles populated', async () => {
    const category = await seedCategory({ name: 'Whisky', type: 'SPIRIT' });
    const bottle = await seedBottle({ name: 'Laphroaig 10', categoryId: category.id, isApero: true });
    const cocktail = await prisma.cocktail.create({
      data: { name: 'Scotch Sour', tags: '' },
    });

    const menu = await prisma.menu.create({
      data: { name: 'Whisky Bar', slug: 'whisky-bar', type: 'COCKTAILS', isPublic: true },
    });

    await prisma.menuCocktail.create({
      data: { menuId: menu.id, cocktailId: cocktail.id, position: 0 },
    });

    await prisma.menuBottle.create({
      data: { menuId: menu.id, bottleId: bottle.id, position: 0 },
    });

    const res = await request.get('/api/public/menus/whisky-bar');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Whisky Bar');
    expect(res.body.cocktails).toHaveLength(1);
    expect(res.body.cocktails[0].cocktail.name).toBe('Scotch Sour');
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].bottle.name).toBe('Laphroaig 10');
    expect(res.body.bottles[0].bottle.category.name).toBe('Whisky');
  });
});
