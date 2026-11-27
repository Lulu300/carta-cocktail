import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Response } from 'supertest';
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
  addBottleToMenu,
  addCocktailToMenu,
  findSystemMenu,
} from '../test/helpers';
import { documentedMountPaths, expectDocumentedResponse } from '../test/documentedResponse';
import { resetRateLimits } from '../middleware/rateLimit';

/*
 * Real answers checked against the OpenAPI declaration of their route (task F-14): at least one
 * route of each route file, each status and media type it documents. The last test fails when a
 * route file has none here.
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
  await resetRateLimits();
});

const checkedMountPaths = new Set<string>();

function expectDocumented(res: Response): void {
  checkedMountPaths.add(expectDocumentedResponse(res).mountPath);
}

describe('answers of the public routes', () => {
  it('GET /api/health, /api/openapi.json and the public menu', async () => {
    const cocktail = await seedFullCocktail();
    const menu = await seedMenu({ isPublic: true });
    await addCocktailToMenu(menu.id, cocktail.id);

    expectDocumented(await request.get('/api/health'));
    expectDocumented(await request.get('/api/openapi.json'));
    expectDocumented(await request.get(`/api/public/menus/${menu.slug}`));
    expectDocumented(await request.get('/api/public/embed-origins'));
  });

  it('an invalid public cocktail id answers the documented 404 with the error body', async () => {
    const res = await request.get('/api/public/cocktails/not-an-id');

    expect(res.status).toBe(404);
    expectDocumented(res);
  });
});

describe('answers of the admin routes', () => {
  it('auth, settings, system and documentation', async () => {
    expectDocumented(await request.get('/api/auth/me').set(authHeader()));
    expectDocumented(await request.get('/api/settings').set(authHeader()));
    expectDocumented(await request.get('/api/system/upgrade-notice').set(authHeader()));
    expectDocumented(await request.get('/api/openapi/full.json').set(authHeader()));
  });

  it('a request without a token answers the documented 401', async () => {
    const res = await request.get('/api/units');

    expect(res.status).toBe(401);
    expectDocumented(res);
  });

  it('an invalid body answers the documented 400 with its issues', async () => {
    const res = await request.post('/api/units').set(authHeader()).send({ name: '' });

    expect(res.status).toBe(400);
    expectDocumented(res);
  });

  it('category types, categories, shortages and bottles', async () => {
    const category = await seedCategory({ desiredStock: 2 });

    expectDocumented(await request.get('/api/category-types').set(authHeader()));
    expectDocumented(await request.get(`/api/categories/${category.id}`).set(authHeader()));
    expectDocumented(await request.get('/api/shortages').set(authHeader()));
    expectDocumented(
      await request
        .post('/api/bottles')
        .set(authHeader())
        .send({ name: 'Rum', categoryId: category.id, capacityMl: 700, quantity: 2 }),
    );
    expectDocumented(await request.get('/api/bottles/export?format=csv').set(authHeader()));
  });

  it('a deletion that recipes block answers the documented 409 with its impact', async () => {
    const ingredient = await seedIngredient();
    await seedFullCocktail({
      ingredients: [{ sourceType: 'INGREDIENT', ingredientId: ingredient.id }],
    });

    const res = await request.delete(`/api/ingredients/${ingredient.id}`).set(authHeader());

    expect(res.status).toBe(409);
    expectDocumented(res);
  });

  it('cocktails and availability', async () => {
    const cocktail = await seedFullCocktail();

    expectDocumented(await request.get(`/api/cocktails/${cocktail.id}/export`).set(authHeader()));
    expectDocumented(await request.get('/api/availability/cocktails').set(authHeader()));
  });

  it('menus, menu sections and menu bottles', async () => {
    const menu = await seedMenu();
    const aperitifs = await findSystemMenu('aperitifs');
    await addBottleToMenu(aperitifs.id, (await seedBottle({ isApero: true })).id);

    expectDocumented(await request.get('/api/menus').set(authHeader()));
    expectDocumented(
      await request
        .post(`/api/menu-sections/menu/${menu.id}/sections`)
        .set(authHeader())
        .send({ name: 'Classics' }),
    );
    expectDocumented(await request.get(`/api/menu-bottles/menu/${aperitifs.id}`).set(authHeader()));
  });

  it('backup export', async () => {
    const res = await request
      .get('/api/backup/export')
      .set(authHeader())
      .buffer(true)
      // Kept as a Buffer instead of letting supertest parse the zip
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expectDocumented(res);
  });
});

describe('coverage of the route files', () => {
  it('should check at least one route of each route file', () => {
    expect([...checkedMountPaths].sort()).toEqual(documentedMountPaths().sort());
  });
});
