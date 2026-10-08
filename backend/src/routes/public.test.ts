import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, getAuthToken, prisma, seedCocktail, seedCategory, seedBottle, seedUnit, seedIngredient,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

const PRIVATE_BOTTLE_FIELDS = ['purchasePrice', 'openedAt', 'remainingPercent'];

/** Put a cocktail in a menu, creating the menu on first use. */
async function addCocktailToMenu(
  cocktailId: number,
  options: { slug?: string; isPublic?: boolean; isHidden?: boolean } = {},
) {
  const slug = options.slug ?? 'public-menu';
  const menu = await prisma.menu.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug, type: 'COCKTAILS', isPublic: options.isPublic ?? true },
  });
  await prisma.menuCocktail.create({
    data: { menuId: menu.id, cocktailId, isHidden: options.isHidden ?? false },
  });
  return menu;
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function expiredAdminToken(): string {
  return getAuthToken(1, { expiresInSeconds: -60 });
}

/** Cocktail with a note, a private bottle and a CATEGORY ingredient with a preferred bottle. */
async function seedPrivateCocktail() {
  const unit = await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });
  const category = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
  const bottle = await seedBottle({ name: 'Havana Club', categoryId: category.id, purchasePrice: 42 });
  await prisma.bottle.update({ where: { id: bottle.id }, data: { openedAt: new Date() } });

  const cocktail = await prisma.cocktail.create({
    data: { name: 'Secret Daiquiri', notes: 'Use the good rum', tags: '' },
  });
  await prisma.cocktailIngredient.create({
    data: { cocktailId: cocktail.id, sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 5, unitId: unit.id, position: 0 },
  });
  const categoryIngredient = await prisma.cocktailIngredient.create({
    data: { cocktailId: cocktail.id, sourceType: 'CATEGORY', categoryId: category.id, quantity: 1, unitId: unit.id, position: 1 },
  });
  await prisma.cocktailPreferredBottle.create({
    data: { cocktailIngredientId: categoryIngredient.id, bottleId: bottle.id },
  });
  return { cocktail, bottle };
}

function expectNoPrivateBottleFields(body: unknown) {
  const json = JSON.stringify(body);
  for (const field of PRIVATE_BOTTLE_FIELDS) {
    expect(json).not.toContain(field);
  }
}

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

  it('should not count hidden cocktails, hidden bottles or empty bottles', async () => {
    const visible = await seedCocktail({ name: 'Visible' });
    const hidden = await seedCocktail({ name: 'Hidden' });
    const menu = await addCocktailToMenu(visible.id);
    await addCocktailToMenu(hidden.id, { isHidden: true });

    const fullBottle = await seedBottle({ name: 'Full' });
    const hiddenBottle = await seedBottle({ name: 'Hidden bottle' });
    const emptyBottle = await seedBottle({ name: 'Empty', remainingPercent: 0 });
    await prisma.menuBottle.createMany({
      data: [
        { menuId: menu.id, bottleId: fullBottle.id },
        { menuId: menu.id, bottleId: hiddenBottle.id, isHidden: true },
        { menuId: menu.id, bottleId: emptyBottle.id },
      ],
    });

    const res = await request.get('/api/public/menus');
    expect(res.status).toBe(200);
    expect(res.body[0]._count).toEqual({ cocktails: 1, bottles: 1 });
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

  it('should return 404 for non-public menu with an unverified token', async () => {
    const res = await request.get('/api/public/menus/aperitifs').set(bearer('x'));
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-public menu with a non-Bearer authorization header', async () => {
    const res = await request.get('/api/public/menus/aperitifs').set({ Authorization: 'x' });
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-public menu with a token signed by another secret', async () => {
    const forged = getAuthToken(1, { secret: 'another-secret' });
    const res = await request.get('/api/public/menus/aperitifs').set(bearer(forged));
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-public menu with an expired admin token', async () => {
    const res = await request.get('/api/public/menus/aperitifs').set(bearer(expiredAdminToken()));
    expect(res.status).toBe(404);
  });

  it('should serve a public menu to a guest holding an expired token', async () => {
    await prisma.menu.create({
      data: { name: 'Open Menu', slug: 'open-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus/open-menu').set(bearer(expiredAdminToken()));
    expect(res.status).toBe(200);
  });

  it('should return public menu with sections, cocktails, bottles', async () => {
    await prisma.menu.create({
      data: { name: 'Open Menu', slug: 'open-menu', type: 'COCKTAILS', isPublic: true },
    });
    const res = await request.get('/api/public/menus/open-menu');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sections');
    expect(res.body).toHaveProperty('cocktails');
    expect(res.body).toHaveProperty('bottles');
  });

  it('should never return hidden cocktails or bottles, for guests and admins', async () => {
    const visible = await seedCocktail({ name: 'Visible' });
    const hidden = await seedCocktail({ name: 'Hidden' });
    const menu = await addCocktailToMenu(visible.id, { slug: 'mixed' });
    await addCocktailToMenu(hidden.id, { slug: 'mixed', isHidden: true });

    const visibleBottle = await seedBottle({ name: 'Visible bottle' });
    const hiddenBottle = await seedBottle({ name: 'Hidden bottle' });
    await prisma.menuBottle.createMany({
      data: [
        { menuId: menu.id, bottleId: visibleBottle.id },
        { menuId: menu.id, bottleId: hiddenBottle.id, isHidden: true },
      ],
    });

    for (const headers of [{}, authHeader()]) {
      const res = await request.get('/api/public/menus/mixed').set(headers);
      expect(res.status).toBe(200);
      expect(res.body.cocktails.map((mc: any) => mc.cocktail.name)).toEqual(['Visible']);
      expect(res.body.bottles.map((mb: any) => mb.bottle.name)).toEqual(['Visible bottle']);
    }
  });

  it('should not expose inventory fields of bottles', async () => {
    const { cocktail, bottle } = await seedPrivateCocktail();
    const menu = await addCocktailToMenu(cocktail.id);
    await prisma.menuBottle.create({ data: { menuId: menu.id, bottleId: bottle.id } });

    for (const headers of [{}, authHeader()]) {
      const res = await request.get('/api/public/menus/public-menu').set(headers);
      expect(res.status).toBe(200);
      expect(res.body.bottles).toHaveLength(1);
      expectNoPrivateBottleFields(res.body);
    }
  });

  it('should return cocktail notes to the admin only', async () => {
    const { cocktail } = await seedPrivateCocktail();
    await addCocktailToMenu(cocktail.id);

    const guest = await request.get('/api/public/menus/public-menu');
    expect(guest.body.cocktails[0].cocktail).not.toHaveProperty('notes');

    const admin = await request.get('/api/public/menus/public-menu').set(authHeader());
    expect(admin.body.cocktails[0].cocktail.notes).toBe('Use the good rum');
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

describe('GET /api/public/units', () => {
  it('should return units without auth', async () => {
    await seedUnit({ name: 'Centilitre', abbreviation: 'cl' });
    await seedUnit({ name: 'Millilitre', abbreviation: 'ml' });
    const res = await request.get('/api/public/units');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Centilitre');
    expect(res.body[1].name).toBe('Millilitre');
  });

  it('should return empty array when no units exist', async () => {
    const res = await request.get('/api/public/units');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/public/cocktails/:id', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999');
    expect(res.status).toBe(404);
  });

  it('should return 404 for a non-numeric id', async () => {
    const res = await request.get('/api/public/cocktails/abc').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return a cocktail visible in a public menu', async () => {
    const cocktail = await seedCocktail({ name: 'Public Mojito' });
    await addCocktailToMenu(cocktail.id);
    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Public Mojito');
  });

  it('should hide a cocktail that is in no menu from guests, not from the admin', async () => {
    const cocktail = await seedCocktail({ name: 'Draft' });

    const guest = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(guest.status).toBe(404);

    const admin = await request.get(`/api/public/cocktails/${cocktail.id}`).set(authHeader());
    expect(admin.status).toBe(200);
    expect(admin.body.name).toBe('Draft');
  });

  it('should treat an expired admin token as a guest on an off-menu cocktail', async () => {
    const cocktail = await seedCocktail({ name: 'Draft' });

    const detail = await request.get(`/api/public/cocktails/${cocktail.id}`).set(bearer(expiredAdminToken()));
    expect(detail.status).toBe(404);

    const exported = await request
      .get(`/api/public/cocktails/${cocktail.id}/export`)
      .set(bearer(expiredAdminToken()));
    expect(exported.status).toBe(404);
  });

  it('should return 404 to guests when the cocktail is hidden in its only public menu', async () => {
    const cocktail = await seedCocktail({ name: 'Hidden' });
    await addCocktailToMenu(cocktail.id, { isHidden: true });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(404);
  });

  it('should return 404 to guests when the cocktail is only in an unpublished menu', async () => {
    const cocktail = await seedCocktail({ name: 'Unpublished' });
    await addCocktailToMenu(cocktail.id, { slug: 'draft-menu', isPublic: false });
    const res = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(res.status).toBe(404);
  });

  it('should return notes and preferred bottles to the admin only, without inventory fields', async () => {
    const { cocktail } = await seedPrivateCocktail();
    await addCocktailToMenu(cocktail.id);

    const guest = await request.get(`/api/public/cocktails/${cocktail.id}`);
    expect(guest.status).toBe(200);
    expect(guest.body).not.toHaveProperty('notes');
    for (const ingredient of guest.body.ingredients) {
      expect(ingredient).not.toHaveProperty('preferredBottles');
    }
    expectNoPrivateBottleFields(guest.body);

    const admin = await request.get(`/api/public/cocktails/${cocktail.id}`).set(authHeader());
    expect(admin.status).toBe(200);
    expect(admin.body.notes).toBe('Use the good rum');
    const categoryIngredient = admin.body.ingredients.find((i: any) => i.sourceType === 'CATEGORY');
    expect(categoryIngredient.preferredBottles[0].bottle.name).toBe('Havana Club');
    expectNoPrivateBottleFields(admin.body);
  });
});

describe('GET /api/public/cocktails/:id/export', () => {
  it('should return 404 for non-existent cocktail', async () => {
    const res = await request.get('/api/public/cocktails/9999/export');
    expect(res.status).toBe(404);
  });

  it('should return 404 for a non-numeric id', async () => {
    const res = await request.get('/api/public/cocktails/abc/export').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return export payload with version=1', async () => {
    const cocktail = await seedCocktail({ name: 'Export Public' });
    await addCocktailToMenu(cocktail.id);
    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cocktail.name).toBe('Export Public');
    expect(res.headers['content-disposition']).toContain('cocktail-export-public.json');
  });

  it('should refuse to export a cocktail outside public menus to guests, not to the admin', async () => {
    const cocktail = await seedCocktail({ name: 'Draft' });
    await addCocktailToMenu(cocktail.id, { isHidden: true });

    const guest = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(guest.status).toBe(404);

    const admin = await request.get(`/api/public/cocktails/${cocktail.id}/export`).set(authHeader());
    expect(admin.status).toBe(200);
  });

  it('should leave notes and preferred bottles out of a guest export', async () => {
    const { cocktail } = await seedPrivateCocktail();
    await addCocktailToMenu(cocktail.id);

    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.cocktail).not.toHaveProperty('notes');
    for (const ingredient of res.body.cocktail.ingredients) {
      expect(ingredient).not.toHaveProperty('preferredBottles');
    }
    expectNoPrivateBottleFields(res.body);
  });
});

describe('GET /api/public/cocktails/:id/export - all 3 source types', () => {
  it('should map BOTTLE, CATEGORY, and INGREDIENT source types correctly for the admin', async () => {
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

    // Admin export: the only one that carries notes and preferred bottles
    const res = await request.get(`/api/public/cocktails/${cocktail.id}/export`).set(authHeader());
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
    await addCocktailToMenu(cocktail.id);

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
    expect(bottleIng.bottle.category.name).toBe('Gin');

    const categoryIng = ingredients.find((i: any) => i.sourceType === 'CATEGORY');
    expect(categoryIng).toBeDefined();
    expect(categoryIng.category.name).toBe('Gin');

    const ingredientIng = ingredients.find((i: any) => i.sourceType === 'INGREDIENT');
    expect(ingredientIng).toBeDefined();
    expect(ingredientIng.ingredient.name).toBe('Tonic Water');
    expect(ingredientIng.unit.abbreviation).toBe('ml');
  });
});

describe('GET /api/public/menus/:slug - menu with cocktails and bottles', () => {
  it('should return public menu with cocktails and bottles populated', async () => {
    const category = await seedCategory({ name: 'Whisky', type: 'SPIRIT' });
    const bottle = await seedBottle({
      name: 'Laphroaig 10',
      categoryId: category.id,
      isApero: true,
      alcoholPercentage: 40,
      location: 'B57',
    });
    const cocktail = await prisma.cocktail.create({
      data: { name: 'Scotch Sour', tags: '' },
    });
    await prisma.cocktailInstruction.create({
      data: { cocktailId: cocktail.id, stepNumber: 1, text: 'Shake with ice' },
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
    expect(res.body.cocktails[0].cocktail.instructions[0].text).toBe('Shake with ice');
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].bottle.name).toBe('Laphroaig 10');
    expect(res.body.bottles[0].bottle.category.name).toBe('Whisky');
    expect(res.body.bottles[0].bottle.alcoholPercentage).toBe(40);
    // The storage location stays public: the bottle menu displays it to guests
    expect(res.body.bottles[0].bottle.location).toBe('B57');
    expect(res.body.bottles[0].bottle.capacityMl).toBe(700);
    expect(res.body.bottles[0].bottle.categoryId).toBe(category.id);
  });
});
