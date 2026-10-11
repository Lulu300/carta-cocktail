import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import supertest from 'supertest';
import app from './app';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, seedUnit, seedCategory, seedBottle, seedIngredient, seedCocktailUsing, prisma,
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
  it('answers 409 JSON with the cocktails for a unit used by a cocktail', async () => {
    const unit = await seedUnit();
    const ingredient = await seedIngredient();
    const cocktail = await seedCocktailUsing('Uses the unit', unit.id, [
      { sourceType: 'INGREDIENT', ingredientId: ingredient.id },
    ]);

    const res = await request.delete(`/api/units/${unit.id}`).set(authHeader());

    expect(res.status).toBe(409);
    expectJsonError(res);
    expect(res.body.error).toBe('Cannot delete: this item is used by cocktail recipes');
    expect(res.body.details.cocktails).toEqual([{ id: cocktail.id, name: 'Uses the unit', removedLines: 1 }]);
    expect(await prisma.unit.findUnique({ where: { id: unit.id } })).not.toBeNull();
  });

  it('answers 409 JSON for a category that still holds bottles', async () => {
    const category = await seedCategory();
    await seedBottle({ categoryId: category.id });

    const res = await request.delete(`/api/categories/${category.id}`).set(authHeader());

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

  it('keeps the 415 status of a body in an unsupported charset', async () => {
    const res = await request.post('/api/units').set(authHeader())
      .set('Content-Type', 'application/json; charset=latin1').send('{}');
    expect(res.status).toBe(415);
    expectJsonError(res);
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

describe('CORS', () => {
  it('does not allow other origins by default', async () => {
    const res = await request.get('/api/public/menus').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight request without allowing the origin', async () => {
    const res = await request.options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Request logs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** What `target` writes to stdout while it answers one request. */
  async function stdoutDuringRequest(target: Express, url: string): Promise<string> {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await supertest(target).get(url);
    // morgan writes when the response finishes, which can come after supertest resolves
    await new Promise((resolve) => setImmediate(resolve));
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    write.mockRestore();
    return output;
  }

  it('are not written in tests', async () => {
    expect(await stdoutDuringRequest(app, '/api/quiet-in-tests')).not.toContain('/api/quiet-in-tests');
  });

  it('are written outside tests', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '3f9c1e7a2b8d4c6e0a1f5b9d7c3e2a4b6d8f0c1e3a5b7d9f');
    vi.resetModules();
    const { default: developmentApp } = await import('./app');
    // The fresh import created its own PrismaClient: close it with the test
    const { prisma: developmentPrisma } = await import('./lib/prisma');

    try {
      expect(await stdoutDuringRequest(developmentApp, '/api/logged')).toContain('GET /api/logged');
    } finally {
      await developmentPrisma.$disconnect();
    }
  });
});
