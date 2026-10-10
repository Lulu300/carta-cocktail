import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, seedUnit, seedCategory, seedBottle, seedIngredient, prisma,
} from './test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

// Every error answer must be JSON with a string message and nothing internal.
function expectJsonError(res: { headers: Record<string, string>; body: unknown }) {
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
  expect(JSON.stringify(res.body)).not.toMatch(/\bat .+\.ts:\d+/);
}

const RESOURCES_BY_ID = [
  { name: 'units', path: '/api/units', methods: ['get', 'put', 'delete'] },
  { name: 'bottles', path: '/api/bottles', methods: ['get', 'put', 'delete'] },
  { name: 'categories', path: '/api/categories', methods: ['get', 'put', 'delete'] },
  { name: 'menu sections', path: '/api/menu-sections/sections', methods: ['put', 'delete'] },
] as const;

describe.each(RESOURCES_BY_ID)('$name: invalid or unknown id', ({ path, methods }) => {
  it.each(methods)('%s with a non-numeric id answers 400 JSON', async (method) => {
    const res = await request[method](`${path}/abc`).set(authHeader()).send({ name: 'x' });
    expect(res.status).toBe(400);
    expectJsonError(res);
  });

  it.each(methods)('%s with an unknown id answers 404 JSON', async (method) => {
    const res = await request[method](`${path}/99999`).set(authHeader()).send({ name: 'x' });
    expect(res.status).toBe(404);
    expectJsonError(res);
  });
});

describe('DELETE of a row still referenced', () => {
  it('answers 409 for a unit used by a cocktail', async () => {
    const unit = await seedUnit();
    const ingredient = await seedIngredient();
    await prisma.cocktail.create({
      data: {
        name: 'Uses the unit',
        ingredients: {
          create: [{ quantity: 1, unitId: unit.id, sourceType: 'INGREDIENT', ingredientId: ingredient.id, position: 0 }],
        },
      },
    });

    const res = await request.delete(`/api/units/${unit.id}`).set(authHeader());

    expect(res.status).toBe(409);
    expectJsonError(res);
    expect(res.body.error).toBe('Cannot delete: resource is in use');
    expect(await prisma.unit.findUnique({ where: { id: unit.id } })).not.toBeNull();
  });

  it('answers 409 for a bottle kept as a preferred bottle', async () => {
    const unit = await seedUnit();
    const category = await seedCategory();
    const bottle = await seedBottle({ categoryId: category.id });
    await prisma.cocktail.create({
      data: {
        name: 'Prefers the bottle',
        ingredients: {
          create: [{
            quantity: 1, unitId: unit.id, sourceType: 'CATEGORY', categoryId: category.id, position: 0,
            preferredBottles: { create: [{ bottleId: bottle.id }] },
          }],
        },
      },
    });

    const res = await request.delete(`/api/bottles/${bottle.id}`).set(authHeader());

    expect(res.status).toBe(409);
    expectJsonError(res);
  });
});

describe('Request body errors', () => {
  it('answers 400 JSON for a malformed JSON body', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .set('Content-Type', 'application/json').send('{');
    expect(res.status).toBe(400);
    expectJsonError(res);
    expect(res.body.error).toBe('The request body is not valid JSON');
  });

  it('translates the malformed JSON message from Accept-Language', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .set('Accept-Language', 'fr')
      .set('Content-Type', 'application/json').send('{');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Le corps de la requête n’est pas un JSON valide');
  });

  it('answers 413 JSON for a JSON body over the parser limit', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expectJsonError(res);
  });

  it('answers 413 JSON for a cocktail image over 5 MB', async () => {
    const cocktail = await prisma.cocktail.create({ data: { name: 'Big Picture' } });
    const sixMegabytes = Buffer.alloc(6 * 1024 * 1024);

    const res = await request.post(`/api/cocktails/${cocktail.id}/image`).set(authHeader())
      .attach('image', sixMegabytes, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expectJsonError(res);
    expect(res.body.error).toBe('The file or request is too large');
  });

  it('answers 400 JSON for an unexpected upload field', async () => {
    const cocktail = await prisma.cocktail.create({ data: { name: 'Wrong Field' } });

    const res = await request.post(`/api/cocktails/${cocktail.id}/image`).set(authHeader())
      .attach('photo', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expectJsonError(res);
  });
});

describe('Unknown API paths', () => {
  it('answers 404 JSON with a token', async () => {
    const res = await request.get('/api/nope').set(authHeader());
    expect(res.status).toBe(404);
    expectJsonError(res);
    expect(res.body.error).toBe('Resource not found');
  });

  it('answers 404 JSON in the requested language', async () => {
    const res = await request.get('/api/nope').set('Accept-Language', 'fr');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ressource introuvable');
  });

  it('answers 404 JSON for an unknown method on a known path', async () => {
    const res = await request.patch('/api/units/1').set(authHeader()).send({});
    expect(res.status).toBe(404);
    expectJsonError(res);
  });
});
