import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
  seedBottle,
  seedCategory,
  seedFullCocktail,
  seedIngredient,
  seedMenu,
  seedMenuSection,
  addCocktailToMenu,
  addBottleToMenu,
  findSystemMenu,
  prisma,
  seedUnit,
  expectContract,
} from '../test/helpers';
import { testImage } from '../test/images';
import { LoginResponse, User } from '../validation/auth';
import { CocktailAvailabilities, CocktailAvailability } from '../validation/availability';
import {
  BottleImportConfirmResponse,
  BottleImportPreviewResponse,
  BottlesExport,
} from '../validation/bottleImport';
import { Bottle, CategoryDetail } from '../validation/bottles';
import { Category, CategoryListItem, Shortage } from '../validation/categories';
import { CategoryType, CategoryTypeListItem } from '../validation/categoryTypes';
import {
  CocktailExportFile,
  CocktailExportFormat,
  ImportPreviewResponse,
} from '../validation/cocktailImport';
import { Cocktail, CocktailRow } from '../validation/cocktails';
import { DeletionResponse, MessageResponse } from '../validation/common';
import { BulkAvailabilityResponse, Ingredient } from '../validation/ingredients';
import { MenuBottleExclusion, MenuSyncResponse } from '../validation/menuBottles';
import { MenuBottle, MenuDetail, MenuRow, MenuSummary, UpdatedMenu } from '../validation/menus';
import { MenuSection } from '../validation/menuSections';
import { PublicCocktail, PublicMenu } from '../validation/public';
import { ProfileResponse, SiteSettings, SiteSettingsRow } from '../validation/settings';
import { HealthResponse } from '../validation/system';
import { Unit } from '../validation/units';

/*
 * Contract tests (task F-05): each response is parsed with the strict schema its frontend type
 * is generated from, so a field added, removed or retyped by a route fails here until the schema
 * and frontend/src/types/generated.ts follow. The data fills every nullable field at least once.
 */

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
});

const TRANSLATIONS = JSON.stringify({ fr: 'Rhum', en: 'Rum' });

/** A recipe with one line of each source type, a preferred bottle and translated names. */
async function seedRecipe() {
  const unit = await seedUnit({ nameTranslations: JSON.stringify({ fr: 'Centilitre' }) });
  const category = await seedCategory({ name: 'Rum', nameTranslations: TRANSLATIONS });
  const bottle = await seedBottle({
    name: 'Havana Club 3',
    categoryId: category.id,
    alcoholPercentage: 40,
    purchasePrice: 18.5,
    location: 'Bar',
    openedAt: new Date('2026-10-11T00:00:00.000Z'),
    isApero: true,
  });
  const ingredient = await seedIngredient({ name: 'Lime', icon: '🍋' });
  const cocktail = await seedFullCocktail({
    name: 'Daiquiri',
    tags: 'classic,sour',
    unitId: unit.id,
    ingredients: [
      { sourceType: 'BOTTLE', bottleId: bottle.id },
      { sourceType: 'CATEGORY', categoryId: category.id, preferredBottleIds: [bottle.id] },
      { sourceType: 'INGREDIENT', ingredientId: ingredient.id },
    ],
    instructions: ['Shake with ice', 'Strain'],
  });
  return { unit, category, bottle, ingredient, cocktail };
}

/** A published cocktail menu with a section, and the aperitifs menu holding the bottle. */
async function seedPublishedMenus() {
  const recipe = await seedRecipe();
  const menu = await seedMenu({ slug: 'summer', isPublic: true, description: 'Long drinks' });
  const section = await seedMenuSection(menu.id, { name: 'Classics' });
  await addCocktailToMenu(menu.id, recipe.cocktail.id, { menuSectionId: section.id });
  const aperitifs = await prisma.menu.update({
    where: { id: (await findSystemMenu('aperitifs')).id },
    data: { isPublic: true },
  });
  await addBottleToMenu(aperitifs.id, recipe.bottle.id);
  return { ...recipe, menu, aperitifs };
}

describe('response contracts of the public routes', () => {
  it('GET /api/public/menus answers MenuSummary[]', async () => {
    await seedPublishedMenus();

    const res = await request.get('/api/public/menus');

    expect(res.status).toBe(200);
    const menus = expectContract(z.array(MenuSummary), res.body);
    expect(menus.map((menu) => menu.slug).sort()).toEqual(['aperitifs', 'summer']);
  });

  it('GET /api/public/menus/:slug answers PublicMenu, for a guest and for the admin', async () => {
    await seedPublishedMenus();

    for (const slug of ['summer', 'aperitifs']) {
      const guest = await request.get(`/api/public/menus/${slug}`);
      const admin = await request.get(`/api/public/menus/${slug}`).set(authHeader());

      expect([guest.status, admin.status]).toEqual([200, 200]);
      expectContract(PublicMenu, guest.body);
      expectContract(PublicMenu, admin.body);
    }
  });

  it('GET /api/public/menus/:slug lists the cocktail with its recipe and the bottle', async () => {
    await seedPublishedMenus();

    const summer = expectContract(PublicMenu, (await request.get('/api/public/menus/summer')).body);
    const aperitifs = expectContract(
      PublicMenu,
      (await request.get('/api/public/menus/aperitifs')).body,
    );

    expect(summer.sections).toHaveLength(1);
    expect(summer.cocktails[0]?.cocktail.ingredients).toHaveLength(3);
    expect(aperitifs.bottles[0]?.bottle.name).toBe('Havana Club 3');
  });

  it('GET /api/public/cocktails/:id answers PublicCocktail, without private fields for a guest', async () => {
    const { cocktail } = await seedPublishedMenus();

    const guest = await request.get(`/api/public/cocktails/${cocktail.id}`);
    const admin = await request.get(`/api/public/cocktails/${cocktail.id}`).set(authHeader());

    const guestCocktail = expectContract(PublicCocktail, guest.body);
    const adminCocktail = expectContract(PublicCocktail, admin.body);
    expect(guestCocktail).not.toHaveProperty('notes');
    expect(guestCocktail.ingredients.every((line) => !('preferredBottles' in line))).toBe(true);
    expect(adminCocktail).toHaveProperty('notes');
    expect(adminCocktail.ingredients[1]?.preferredBottles).toHaveLength(1);
  });

  it('GET /api/public/settings answers SiteSettings', async () => {
    const res = await request.get('/api/public/settings');

    expect(res.status).toBe(200);
    expectContract(SiteSettings, res.body);
  });

  it('GET /api/public/units answers Unit[]', async () => {
    await seedRecipe();

    const res = await request.get('/api/public/units');

    expect(res.status).toBe(200);
    expect(expectContract(z.array(Unit), res.body).length).toBeGreaterThan(0);
  });
});

describe('response contracts of the cocktail routes', () => {
  it('GET /api/cocktails and GET /api/cocktails/:id answer Cocktail', async () => {
    const { cocktail } = await seedRecipe();

    const list = await request.get('/api/cocktails').set(authHeader());
    const one = await request.get(`/api/cocktails/${cocktail.id}`).set(authHeader());

    expect([list.status, one.status]).toEqual([200, 200]);
    expectContract(z.array(Cocktail), list.body);
    const parsed = expectContract(Cocktail, one.body);
    expect(parsed.ingredients.map((line) => line.sourceType)).toEqual([
      'BOTTLE',
      'CATEGORY',
      'INGREDIENT',
    ]);
  });

  it('POST and PUT /api/cocktails answer Cocktail', async () => {
    const { bottle, unit } = await seedRecipe();
    const body = {
      name: 'Mojito',
      description: 'Fresh',
      notes: 'Muddle gently',
      tags: ['summer'],
      ingredients: [{ sourceType: 'BOTTLE', bottleId: bottle.id, quantity: 5, unitId: unit.id }],
      instructions: [{ text: 'Muddle' }],
    };

    const created = await request.post('/api/cocktails').set(authHeader()).send(body);
    const updated = await request
      .put(`/api/cocktails/${created.body.id}`)
      .set(authHeader())
      .send({ ...body, name: 'Virgin Mojito' });

    expect([created.status, updated.status]).toEqual([201, 200]);
    expectContract(Cocktail, created.body);
    expectContract(Cocktail, updated.body);
  });

  it('POST /api/cocktails/:id/image answers CocktailRow', async () => {
    const { cocktail } = await seedRecipe();

    const res = await request
      .post(`/api/cocktails/${cocktail.id}/image`)
      .set(authHeader())
      .attach('image', await testImage(), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(expectContract(CocktailRow, res.body).imagePath).toMatch(/\.webp$/);
  });

  it('DELETE /api/cocktails/:id answers MessageResponse', async () => {
    const { cocktail } = await seedRecipe();

    const res = await request.delete(`/api/cocktails/${cocktail.id}`).set(authHeader());

    expect(res.status).toBe(200);
    expectContract(MessageResponse, res.body);
  });
});

describe('response contracts of the bottle routes', () => {
  it('GET /api/bottles and GET /api/bottles/:id answer Bottle', async () => {
    const { bottle } = await seedRecipe();

    const list = await request.get('/api/bottles').set(authHeader());
    const one = await request.get(`/api/bottles/${bottle.id}`).set(authHeader());

    expect([list.status, one.status]).toEqual([200, 200]);
    expectContract(z.array(Bottle), list.body);
    expect(expectContract(Bottle, one.body).category.nameTranslations).toEqual({
      fr: 'Rhum',
      en: 'Rum',
    });
  });

  it('POST /api/bottles answers Bottle, or Bottle[] for a quantity above 1', async () => {
    const { category } = await seedRecipe();
    const body = { name: 'Plantation 3 Stars', categoryId: category.id, capacityMl: 700 };

    const one = await request.post('/api/bottles').set(authHeader()).send(body);
    const several = await request
      .post('/api/bottles')
      .set(authHeader())
      .send({ ...body, quantity: 2, openedAt: '2026-10-11' });

    expect([one.status, several.status]).toEqual([201, 201]);
    expectContract(Bottle, one.body);
    expect(expectContract(z.array(Bottle), several.body)).toHaveLength(2);
  });

  it('PUT /api/bottles/:id answers Bottle', async () => {
    const { bottle } = await seedRecipe();

    const res = await request
      .put(`/api/bottles/${bottle.id}`)
      .set(authHeader())
      .send({ remainingPercent: 40 });

    expect(res.status).toBe(200);
    expectContract(Bottle, res.body);
  });

  it('DELETE /api/bottles/:id answers DeletionResponse, with the impact of a forced deletion', async () => {
    const { bottle } = await seedRecipe();

    const res = await request.delete(`/api/bottles/${bottle.id}?force=true`).set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(DeletionResponse, res.body).impact.cocktails).toHaveLength(1);
  });
});

describe('response contracts of the auth routes', () => {
  it('POST /api/auth/login answers LoginResponse, GET /api/auth/me answers User', async () => {
    const login = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'testpass123' });
    const me = await request.get('/api/auth/me').set(authHeader());

    expect([login.status, me.status]).toEqual([200, 200]);
    expectContract(LoginResponse, login.body);
    expectContract(User, me.body);
  });

  it('POST /api/auth/logout-all answers MessageResponse', async () => {
    const res = await request.post('/api/auth/logout-all').set(authHeader());

    expect(res.status).toBe(200);
    expectContract(MessageResponse, res.body);
  });
});

describe('response contracts of the category type routes', () => {
  it('GET /api/category-types answers CategoryTypeListItem[]', async () => {
    await prisma.categoryType.update({
      where: { name: 'SPIRIT' },
      data: { nameTranslations: TRANSLATIONS },
    });
    await seedCategory({ type: 'SPIRIT' });

    const res = await request.get('/api/category-types').set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(z.array(CategoryTypeListItem), res.body)).toHaveLength(3);
  });

  it('POST and PUT /api/category-types answer CategoryType, by path and by query', async () => {
    const created = await request
      .post('/api/category-types')
      .set(authHeader())
      .send({ name: 'Bitter', nameTranslations: { fr: 'Amer' } });
    const byPath = await request
      .put('/api/category-types/BITTER')
      .set(authHeader())
      .send({ color: 'red' });
    const byQuery = await request
      .put('/api/category-types?name=BITTER')
      .set(authHeader())
      .send({ nameTranslations: null });

    expect([created.status, byPath.status, byQuery.status]).toEqual([201, 200, 200]);
    expectContract(CategoryType, created.body);
    expectContract(CategoryType, byPath.body);
    expectContract(CategoryType, byQuery.body);
  });

  it('DELETE /api/category-types answers MessageResponse, by path and by query', async () => {
    await prisma.categoryType.createMany({ data: [{ name: 'BITTER' }, { name: 'WINE' }] });

    const byPath = await request.delete('/api/category-types/BITTER').set(authHeader());
    const byQuery = await request.delete('/api/category-types?name=WINE').set(authHeader());

    expect([byPath.status, byQuery.status]).toEqual([200, 200]);
    expectContract(MessageResponse, byPath.body);
    expectContract(MessageResponse, byQuery.body);
  });
});

describe('response contracts of the category routes', () => {
  it('GET /api/categories answers CategoryListItem[], GET /api/categories/:id CategoryDetail', async () => {
    const { category } = await seedRecipe();

    const list = await request.get('/api/categories').set(authHeader());
    const one = await request.get(`/api/categories/${category.id}`).set(authHeader());

    expect([list.status, one.status]).toEqual([200, 200]);
    expect(expectContract(z.array(CategoryListItem), list.body)[0]?._count.bottles).toBe(1);
    expect(expectContract(CategoryDetail, one.body).bottles).toHaveLength(1);
  });

  it('POST and PUT /api/categories answer Category', async () => {
    const created = await request
      .post('/api/categories')
      .set(authHeader())
      .send({ name: 'Gin', type: 'SPIRIT', nameTranslations: { en: 'Gin' } });
    const updated = await request
      .put(`/api/categories/${created.body.id}`)
      .set(authHeader())
      .send({ desiredStock: 2 });

    expect([created.status, updated.status]).toEqual([201, 200]);
    expectContract(Category, created.body);
    expectContract(Category, updated.body);
  });

  it('DELETE /api/categories/:id answers DeletionResponse, with the bottles deleted', async () => {
    const { category } = await seedRecipe();

    const res = await request.delete(`/api/categories/${category.id}?force=true`).set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(DeletionResponse, res.body).impact.bottles).toHaveLength(1);
  });

  it('GET /api/shortages answers Shortage[]', async () => {
    const category = await seedCategory({ nameTranslations: TRANSLATIONS, desiredStock: 2 });
    await seedBottle({ categoryId: category.id, remainingPercent: 50 });

    const res = await request.get('/api/shortages').set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(z.array(Shortage), res.body)).toHaveLength(1);
  });
});

describe('response contracts of the ingredient routes', () => {
  it('GET /api/ingredients and GET /api/ingredients/:id answer Ingredient', async () => {
    const { ingredient } = await seedRecipe();
    await seedIngredient({ name: 'Mint', nameTranslations: JSON.stringify({ fr: 'Menthe' }) });

    const list = await request.get('/api/ingredients').set(authHeader());
    const one = await request.get(`/api/ingredients/${ingredient.id}`).set(authHeader());

    expect([list.status, one.status]).toEqual([200, 200]);
    expect(expectContract(z.array(Ingredient), list.body)).toHaveLength(2);
    expectContract(Ingredient, one.body);
  });

  it('POST and PUT /api/ingredients answer Ingredient', async () => {
    const created = await request
      .post('/api/ingredients')
      .set(authHeader())
      .send({ name: 'Mint', icon: '🌿' });
    const updated = await request
      .put(`/api/ingredients/${created.body.id}`)
      .set(authHeader())
      .send({ isAvailable: false });

    expect([created.status, updated.status]).toEqual([201, 200]);
    expectContract(Ingredient, created.body);
    expectContract(Ingredient, updated.body);
  });

  it('POST /api/ingredients/bulk-availability answers BulkAvailabilityResponse', async () => {
    await seedRecipe();

    const res = await request
      .post('/api/ingredients/bulk-availability')
      .set(authHeader())
      .send({ available: false });

    expect(res.status).toBe(200);
    expect(expectContract(BulkAvailabilityResponse, res.body).updated).toBe(1);
  });

  it('DELETE /api/ingredients/:id answers DeletionResponse', async () => {
    const { ingredient } = await seedRecipe();

    const res = await request
      .delete(`/api/ingredients/${ingredient.id}?force=true`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(DeletionResponse, res.body).impact.cocktails).toHaveLength(1);
  });
});

describe('response contracts of the unit routes', () => {
  it('GET /api/units and GET /api/units/:id answer Unit', async () => {
    const { unit } = await seedRecipe();

    const list = await request.get('/api/units').set(authHeader());
    const one = await request.get(`/api/units/${unit.id}`).set(authHeader());

    expect([list.status, one.status]).toEqual([200, 200]);
    expectContract(z.array(Unit), list.body);
    expectContract(Unit, one.body);
  });

  it('POST, PUT and DELETE /api/units answer Unit, then MessageResponse', async () => {
    const created = await request
      .post('/api/units')
      .set(authHeader())
      .send({ name: 'Piece', abbreviation: 'pc', conversionFactorToMl: null });
    const updated = await request
      .put(`/api/units/${created.body.id}`)
      .set(authHeader())
      .send({ nameTranslations: { fr: 'Pièce' } });
    const deleted = await request.delete(`/api/units/${created.body.id}`).set(authHeader());

    expect([created.status, updated.status, deleted.status]).toEqual([201, 200, 200]);
    expectContract(Unit, created.body);
    expectContract(Unit, updated.body);
    expectContract(MessageResponse, deleted.body);
  });
});

describe('response contracts of the admin menu routes', () => {
  it('GET /api/menus answers MenuSummary[], GET /api/menus/:id MenuDetail', async () => {
    const { menu, aperitifs } = await seedPublishedMenus();

    const list = await request.get('/api/menus').set(authHeader());
    const cocktails = await request.get(`/api/menus/${menu.id}`).set(authHeader());
    const bottles = await request.get(`/api/menus/${aperitifs.id}`).set(authHeader());

    expect([list.status, cocktails.status, bottles.status]).toEqual([200, 200, 200]);
    expect(expectContract(z.array(MenuSummary), list.body)).toHaveLength(3);
    const detail = expectContract(MenuDetail, cocktails.body);
    expect(detail.cocktails[0]?.cocktail.ingredients).toHaveLength(3);
    expect(expectContract(MenuDetail, bottles.body).bottles).toHaveLength(1);
  });

  it('POST /api/menus answers MenuRow, PUT /api/menus/:id UpdatedMenu', async () => {
    const { cocktail, bottle } = await seedRecipe();
    const created = await request
      .post('/api/menus')
      .set(authHeader())
      .send({ name: 'Summer', slug: 'summer', description: 'Long drinks' });
    const personalBottles = await seedMenu({ type: 'APEROS' });

    const cocktails = await request
      .put(`/api/menus/${created.body.id}`)
      .set(authHeader())
      .send({ cocktails: [{ cocktailId: cocktail.id }] });
    const bottles = await request
      .put(`/api/menus/${personalBottles.id}`)
      .set(authHeader())
      .send({ bottles: [{ bottleId: bottle.id }] });

    expect([created.status, cocktails.status, bottles.status]).toEqual([201, 200, 200]);
    expectContract(MenuRow, created.body);
    expect(expectContract(UpdatedMenu, cocktails.body).cocktails).toHaveLength(1);
    expect(expectContract(UpdatedMenu, bottles.body).bottles).toHaveLength(1);
  });

  it('DELETE /api/menus/:id answers MessageResponse', async () => {
    const menu = await seedMenu();

    const res = await request.delete(`/api/menus/${menu.id}`).set(authHeader());

    expect(res.status).toBe(200);
    expectContract(MessageResponse, res.body);
  });
});

describe('response contracts of the menu section routes', () => {
  it('GET, POST and PUT answer MenuSection', async () => {
    const menu = await seedMenu();
    await seedMenuSection(menu.id);

    const created = await request
      .post(`/api/menu-sections/menu/${menu.id}/sections`)
      .set(authHeader())
      .send({ name: 'Classics' });
    const updated = await request
      .put(`/api/menu-sections/sections/${created.body.id}`)
      .set(authHeader())
      .send({ name: 'Signatures' });
    const list = await request.get(`/api/menu-sections/menu/${menu.id}/sections`).set(authHeader());

    expect([created.status, updated.status, list.status]).toEqual([201, 200, 200]);
    expectContract(MenuSection, created.body);
    expectContract(MenuSection, updated.body);
    expect(expectContract(z.array(MenuSection), list.body)).toHaveLength(2);
  });

  it('the reorder and the deletion answer MessageResponse', async () => {
    const menu = await seedMenu();
    const first = await seedMenuSection(menu.id, { position: 0 });
    const second = await seedMenuSection(menu.id, { position: 1 });

    const reordered = await request
      .post(`/api/menu-sections/menu/${menu.id}/sections/reorder`)
      .set(authHeader())
      .send({ sectionIds: [second.id, first.id] });
    const deleted = await request
      .delete(`/api/menu-sections/sections/${first.id}`)
      .set(authHeader());

    expect([reordered.status, deleted.status]).toEqual([200, 200]);
    expectContract(MessageResponse, reordered.body);
    expectContract(MessageResponse, deleted.body);
  });
});

describe('response contracts of the menu bottle routes', () => {
  /** A personal aperitifs menu with a section, and two aperitifs of the same category. */
  async function seedBottleMenu() {
    const { bottle, category } = await seedRecipe();
    const other = await seedBottle({ name: 'Diplomatico', categoryId: category.id, isApero: true });
    const menu = await seedMenu({ type: 'APEROS' });
    const section = await seedMenuSection(menu.id);
    return { bottle, other, menu, section };
  }

  it('GET /menu/:menuId answers MenuBottle[], POST and PUT answer MenuBottle', async () => {
    const { bottle, menu, section } = await seedBottleMenu();

    const created = await request
      .post('/api/menu-bottles')
      .set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id, menuSectionId: section.id });
    const updated = await request
      .put(`/api/menu-bottles/${created.body.id}`)
      .set(authHeader())
      .send({ isHidden: true });
    const list = await request.get(`/api/menu-bottles/menu/${menu.id}`).set(authHeader());

    expect([created.status, updated.status, list.status]).toEqual([201, 200, 200]);
    expectContract(MenuBottle, created.body);
    expectContract(MenuBottle, updated.body);
    expect(expectContract(z.array(MenuBottle), list.body)).toHaveLength(1);
  });

  it('the group changes, the reorder and the deletions answer MessageResponse', async () => {
    const { bottle, other, menu } = await seedBottleMenu();
    const added = await request
      .post(`/api/menu-bottles/menu/${menu.id}/entries`)
      .set(authHeader())
      .send({ bottleIds: [bottle.id, other.id] });
    const entries = await prisma.menuBottle.findMany({ where: { menuId: menu.id } });
    const ids = entries.map((entry) => entry.id);

    const responses = [
      added,
      await request
        .put(`/api/menu-bottles/menu/${menu.id}/entries`)
        .set(authHeader())
        .send({ ids, isHidden: true }),
      await request
        .post(`/api/menu-bottles/menu/${menu.id}/reorder`)
        .set(authHeader())
        .send({ ids: [...ids].reverse() }),
      await request
        .post(`/api/menu-bottles/menu/${menu.id}/entries/remove`)
        .set(authHeader())
        .send({ ids: [ids[0]] }),
      await request.delete(`/api/menu-bottles/${ids[1]}`).set(authHeader()),
    ];

    expect(responses.map((res) => res.status)).toEqual([201, 200, 200, 200, 200]);
    for (const res of responses) expectContract(MessageResponse, res.body);
  });

  it('the exclusions of a system menu answer MenuBottleExclusion[] and MessageResponse', async () => {
    const { bottle, other } = await seedBottleMenu();
    const aperitifs = await findSystemMenu('aperitifs');
    await addBottleToMenu(aperitifs.id, bottle.id);
    await addBottleToMenu(aperitifs.id, other.id, { position: 1 });
    const exclusionsUrl = `/api/menu-bottles/menu/${aperitifs.id}/exclusions`;

    const excluded = await request
      .post(exclusionsUrl)
      .set(authHeader())
      .send({ bottleIds: [bottle.id, other.id] });
    const list = await request.get(exclusionsUrl).set(authHeader());
    const restoredMany = await request
      .post(`${exclusionsUrl}/restore`)
      .set(authHeader())
      .send({ bottleIds: [bottle.id] });
    const restoredOne = await request.delete(`${exclusionsUrl}/${other.id}`).set(authHeader());

    const statuses = [excluded.status, list.status, restoredMany.status, restoredOne.status];
    expect(statuses).toEqual([200, 200, 200, 200]);
    expect(expectContract(z.array(MenuBottleExclusion), list.body)).toHaveLength(2);
    expectContract(MessageResponse, excluded.body);
    expectContract(MessageResponse, restoredMany.body);
    expectContract(MessageResponse, restoredOne.body);
  });

  it('POST /menu/:menuId/sync answers MenuSyncResponse', async () => {
    await seedRecipe();
    const aperitifs = await findSystemMenu('aperitifs');

    const res = await request.post(`/api/menu-bottles/menu/${aperitifs.id}/sync`).set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(MenuSyncResponse, res.body).added).toBe(1);
  });
});

describe('response contracts of the availability routes', () => {
  it('GET /api/availability/cocktails answers CocktailAvailabilities, /:id CocktailAvailability', async () => {
    const { cocktail, ingredient } = await seedRecipe();
    await prisma.ingredient.update({ where: { id: ingredient.id }, data: { isAvailable: false } });
    // A line whose source was deleted
    await seedFullCocktail({ name: 'Orphan', ingredients: [{ sourceType: 'BOTTLE' }] });

    const all = await request.get('/api/availability/cocktails').set(authHeader());
    const one = await request.get(`/api/availability/cocktails/${cocktail.id}`).set(authHeader());

    expect([all.status, one.status]).toEqual([200, 200]);
    expect(Object.keys(expectContract(CocktailAvailabilities, all.body))).toHaveLength(2);
    const lines = expectContract(CocktailAvailability, one.body).ingredients;
    expect(lines.map((line) => line.sourceType)).toEqual(['BOTTLE', 'CATEGORY', 'INGREDIENT']);
  });
});

describe('response contracts of the settings routes', () => {
  it('GET and PUT /api/settings answer SiteSettingsRow', async () => {
    const read = await request.get('/api/settings').set(authHeader());
    const updated = await request
      .put('/api/settings')
      .set(authHeader())
      .send({ siteName: 'Bar', siteIcon: '🍸' });

    expect([read.status, updated.status]).toEqual([200, 200]);
    expectContract(SiteSettingsRow, read.body);
    expectContract(SiteSettingsRow, updated.body);
  });

  it('PUT /api/settings/profile answers ProfileResponse, with a token after a new password', async () => {
    const email = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ email: 'bar@test.local', currentPassword: 'testpass123' });
    const password = await request
      .put('/api/settings/profile')
      .set(authHeader())
      .send({ currentPassword: 'testpass123', newPassword: 'a-new-long-password' });

    expect([email.status, password.status]).toEqual([200, 200]);
    expect(expectContract(ProfileResponse, email.body)).not.toHaveProperty('token');
    expect(expectContract(ProfileResponse, password.body).token).toEqual(expect.any(String));
  });
});

describe('response contracts of the cocktail exports and imports', () => {
  it('the exports of one cocktail answer CocktailExportFormat, for the admin and for a guest', async () => {
    const { cocktail } = await seedPublishedMenus();
    // A line whose source was deleted exports an empty source detail
    await prisma.cocktailIngredient.updateMany({
      where: { cocktailId: cocktail.id, sourceType: 'INGREDIENT' },
      data: { ingredientId: null },
    });

    const admin = await request.get(`/api/cocktails/${cocktail.id}/export`).set(authHeader());
    const guest = await request.get(`/api/public/cocktails/${cocktail.id}/export`);

    expect([admin.status, guest.status]).toEqual([200, 200]);
    const adminExport = expectContract(CocktailExportFormat, admin.body);
    const guestExport = expectContract(CocktailExportFormat, guest.body);
    expect(adminExport.cocktail.ingredients[1]?.preferredBottles).toHaveLength(1);
    expect(guestExport.cocktail).not.toHaveProperty('notes');
  });

  it('POST /api/cocktails/export answers CocktailExportFile[]', async () => {
    const { cocktail } = await seedRecipe();

    const res = await request
      .post('/api/cocktails/export')
      .set(authHeader())
      .send({ ids: [cocktail.id] });

    expect(res.status).toBe(200);
    expect(expectContract(z.array(CocktailExportFile), res.body)).toHaveLength(1);
  });

  it('POST /api/cocktails/import/preview answers ImportPreviewResponse', async () => {
    const { cocktail } = await seedRecipe();
    // A second category equal to the file's name ignoring case makes it ambiguous
    await seedCategory({ name: 'RUM' });
    const exported = await request.get(`/api/cocktails/${cocktail.id}/export`).set(authHeader());
    const recipe = expectContract(CocktailExportFormat, exported.body);
    const [firstLine] = recipe.cocktail.ingredients;
    recipe.cocktail.ingredients.push({
      ...firstLine!,
      sourceType: 'CATEGORY',
      sourceName: 'rum',
      sourceDetail: { type: 'SPIRIT', nameTranslations: null },
      unit: { ...firstLine!.unit, abbreviation: 'dash' },
    });

    const res = await request.post('/api/cocktails/import/preview').set(authHeader()).send(recipe);

    expect(res.status).toBe(200);
    const preview = expectContract(ImportPreviewResponse, res.body);
    expect(preview.units.map((unit) => unit.status)).toEqual(['matched', 'missing']);
    expect(preview.categories.map((category) => category.status)).toContain('ambiguous');
  });

  it('POST /api/cocktails/import/confirm answers Cocktail', async () => {
    const { unit, category, bottle, ingredient, cocktail } = await seedRecipe();
    const exported = await request.get(`/api/cocktails/${cocktail.id}/export`).set(authHeader());
    const useExisting = (key: string, existingId: number) => ({
      [key]: { action: 'use_existing', existingId },
    });
    const resolutions = {
      units: useExisting(unit.abbreviation, unit.id),
      categories: useExisting('rum', category.id),
      bottles: useExisting('havana club 3', bottle.id),
      ingredients: useExisting('lime', ingredient.id),
    };

    const res = await request
      .post('/api/cocktails/import/confirm')
      .set(authHeader())
      .send({ recipe: exported.body, resolutions });

    expect(res.status).toBe(201);
    expectContract(Cocktail, res.body);
  });
});

describe('response contracts of the bottle exports and imports', () => {
  /** A bottle file with a translated category, a duplicate, a row left out and a value to check. */
  function bottleFile(): Buffer {
    const rum = { name: 'Rum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30 };
    return Buffer.from(
      JSON.stringify({
        version: 1,
        categories: [
          { ...rum, nameTranslations: { fr: 'Rhum' } },
          { ...rum, name: 'Vermouth' },
        ],
        bottles: [
          { name: 'Havana Club 3', categoryName: 'Rum', capacityMl: 700 },
          { name: 'Two\nlines', categoryName: 'Vermouth', capacityMl: 750, openedAt: '2026-10-11' },
          { name: 'No capacity', categoryName: 'Rum' },
        ],
      }),
    );
  }

  it('POST /api/bottles/import/preview answers BottleImportPreviewResponse', async () => {
    await seedRecipe();

    const res = await request
      .post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', bottleFile(), 'bottles.json');

    expect(res.status).toBe(200);
    const preview = expectContract(BottleImportPreviewResponse, res.body);
    expect(preview.categories.map((category) => category.status)).toEqual(['matched', 'missing']);
    expect(preview.bottles[0]?.potentialDuplicates).toHaveLength(1);
    expect([preview.errors.length, preview.warnings.length]).toEqual([1, 1]);
  });

  it('POST /api/bottles/import/preview lists the categories a name matches ignoring case', async () => {
    await seedCategory({ name: 'RUM' });
    await seedCategory({ name: 'rUm' });

    const res = await request
      .post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', bottleFile(), 'bottles.json');

    const preview = expectContract(BottleImportPreviewResponse, res.body);
    expect(preview.categories[0]?.ambiguousMatches).toHaveLength(2);
  });

  it('POST /api/bottles/import/confirm answers BottleImportConfirmResponse', async () => {
    const { category } = await seedRecipe();
    const preview = await request
      .post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', bottleFile(), 'bottles.json');

    const res = await request
      .post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({
        payload: preview.body.payload,
        resolutions: {
          categories: {
            Rum: { action: 'use_existing', existingId: category.id },
            Vermouth: { action: 'create', data: {} },
          },
        },
      });

    expect(res.status).toBe(201);
    expect(expectContract(BottleImportConfirmResponse, res.body).created.bottles).toBe(2);
  });

  it('GET /api/bottles/export?format=json answers BottlesExport', async () => {
    await seedRecipe();

    const res = await request.get('/api/bottles/export?format=json').set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(BottlesExport, res.body).bottles).toHaveLength(1);
  });
});

describe('response contract of the health route', () => {
  it('GET /api/health answers HealthResponse, when the database answers and when it fails', async () => {
    const ok = await request.get('/api/health');
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('SQLITE_CANTOPEN'));
    const unavailable = await request.get('/api/health');

    expect([ok.status, unavailable.status]).toEqual([200, 503]);
    expectContract(HealthResponse, ok.body);
    expectContract(HealthResponse, unavailable.body);
  });
});
