import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
} from '../test/helpers';
import { testImage } from '../test/images';
import { DeletionResponse, MessageResponse } from '../validation/common';
import { Bottle } from '../validation/bottles';
import { Cocktail, CocktailRow } from '../validation/cocktails';
import { PublicCocktail, PublicMenu, PublicMenuSummary } from '../validation/public';
import { AdminSiteSettings, SiteSettings } from '../validation/settings';
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

/** Parses a body with the schema; a failure lists the fields that differ. */
function expectContract<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  expect(result.error?.issues ?? []).toEqual([]);
  return result.data as z.output<S>;
}

describe('response contracts of the public routes', () => {
  it('GET /api/public/menus answers PublicMenuSummary[]', async () => {
    await seedPublishedMenus();

    const res = await request.get('/api/public/menus');

    expect(res.status).toBe(200);
    const menus = expectContract(z.array(PublicMenuSummary), res.body);
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

  it('GET and PUT /api/settings answer AdminSiteSettings', async () => {
    const read = await request.get('/api/settings').set(authHeader());
    const saved = await request
      .put('/api/settings')
      .set(authHeader())
      .send({ embedOrigins: ['https://www.mon-bar.fr'] });

    expect([read.status, saved.status]).toEqual([200, 200]);
    expectContract(AdminSiteSettings, read.body);
    expect(expectContract(AdminSiteSettings, saved.body).embedOrigins).toEqual([
      'https://www.mon-bar.fr',
    ]);
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
