import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

/** The fields of GET /api/category-types these tests read. */
interface CategoryTypeUsage {
  name: string;
  _count: { categories: number };
}

describe('GET /api/category-types', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/category-types');
    expect(res.status).toBe(401);
  });

  it('should return all category types with usage counts', async () => {
    await seedCategory({ type: 'SPIRIT' });
    const res = await request.get('/api/category-types').set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const types: CategoryTypeUsage[] = res.body;
    const spirit = types.find((t) => t.name === 'SPIRIT');
    expect(spirit?._count.categories).toBe(1);
  });

  it('should return count of 0 for unused types', async () => {
    const res = await request.get('/api/category-types').set(authHeader());
    const types: CategoryTypeUsage[] = res.body;
    const soft = types.find((t) => t.name === 'SOFT');
    expect(soft?._count.categories).toBe(0);
  });
});

describe('POST /api/category-types', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('should answer a missing name in French', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).set('Accept-Language', 'fr').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Erreur de validation');
  });

  it('should return 409 if type already exists', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).set('Accept-Language', 'fr')
      .send({ name: 'spirit' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Cette entrée existe déjà' });
  });

  it('should create with uppercase name and default color', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).send({ name: 'juice' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('JUICE');
    expect(res.body.color).toBe('gray');
  });

  it('should store nameTranslations', async () => {
    const res = await request.post('/api/category-types').set(authHeader())
      .send({ name: 'BITTERS', nameTranslations: { fr: 'Amers' }, color: 'red' });
    expect(res.status).toBe(201);
    expect(res.body.nameTranslations).toEqual({ fr: 'Amers' });
    expect(res.body.color).toBe('red');
  });
});

describe('PUT /api/category-types/:name', () => {
  it('should return 404 for non-existent type', async () => {
    const res = await request.put('/api/category-types/NONEXISTENT').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Resource not found' });
  });

  it('should update color', async () => {
    const res = await request.put('/api/category-types/SPIRIT').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(200);
    expect(res.body.color).toBe('red');
  });

  it('should update nameTranslations', async () => {
    const res = await request.put('/api/category-types/SPIRIT').set(authHeader())
      .send({ nameTranslations: { fr: 'Spiritueux' } });
    expect(res.status).toBe(200);
    expect(res.body.nameTranslations).toEqual({ fr: 'Spiritueux' });
  });
});

describe('DELETE /api/category-types/:name', () => {
  it('should return a translated 409 if type is in use', async () => {
    await seedCategory({ type: 'SPIRIT' });
    const res = await request.delete('/api/category-types/SPIRIT').set(authHeader()).set('Accept-Language', 'fr');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Impossible de supprimer : des catégories utilisent encore ce type' });
    expect(await prisma.categoryType.findUnique({ where: { name: 'SPIRIT' } })).not.toBeNull();
  });

  it('should delete unused type', async () => {
    const res = await request.delete('/api/category-types/SOFT').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Type deleted successfully' });
    // Verify it's gone
    const check = await prisma.categoryType.findUnique({ where: { name: 'SOFT' } });
    expect(check).toBeNull();
  });
});
