import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/categories', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/categories');
    expect(res.status).toBe(401);
  });

  it('should return empty array when no categories', async () => {
    const res = await request.get('/api/categories').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return categories sorted by name with bottle counts', async () => {
    const catB = await seedCategory({ name: 'Bourbon', type: 'SPIRIT' });
    await seedCategory({ name: 'Absinthe', type: 'SPIRIT' });
    await seedBottle({ categoryId: catB.id });

    const res = await request.get('/api/categories').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Absinthe');
    expect(res.body[1].name).toBe('Bourbon');
    expect(res.body[1]._count.bottles).toBe(1);
  });

  it('should include categoryType metadata', async () => {
    await seedCategory({ name: 'Vodka', type: 'SPIRIT' });
    const res = await request.get('/api/categories').set(authHeader());
    expect(res.body[0].categoryType).toBeDefined();
    expect(res.body[0].categoryType.name).toBe('SPIRIT');
    expect(res.body[0].categoryType.color).toBe('blue');
  });
});

describe('GET /api/categories/:id', () => {
  it('should return 404 for non-existent category', async () => {
    const res = await request.get('/api/categories/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return category with bottles', async () => {
    const cat = await seedCategory({ name: 'Rum' });
    await seedBottle({ name: 'Havana Club', categoryId: cat.id });

    const res = await request.get(`/api/categories/${cat.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Rum');
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].name).toBe('Havana Club');
  });
});

describe('POST /api/categories', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/categories').set(authHeader()).send({ type: 'SPIRIT' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if type is missing', async () => {
    const res = await request.post('/api/categories').set(authHeader()).send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('should create with default desiredStock=1', async () => {
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'Gin', type: 'SPIRIT' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Gin');
    expect(res.body.desiredStock).toBe(1);
  });

  it('should auto-create CategoryType if it does not exist', async () => {
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'OJ', type: 'JUICE' });
    expect(res.status).toBe(201);
    const ct = await prisma.categoryType.findUnique({ where: { name: 'JUICE' } });
    expect(ct).not.toBeNull();
  });

  it('should store nameTranslations', async () => {
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'Whisky', type: 'SPIRIT', nameTranslations: { fr: 'Whisky' } });
    expect(res.status).toBe(201);
    expect(res.body.nameTranslations).toEqual({ fr: 'Whisky' });
  });
});

describe('PUT /api/categories/:id', () => {
  it('should update category name', async () => {
    const cat = await seedCategory({ name: 'Old Name' });
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('should update desiredStock', async () => {
    const cat = await seedCategory();
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ desiredStock: 5 });
    expect(res.status).toBe(200);
    expect(res.body.desiredStock).toBe(5);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('should delete a category', async () => {
    const cat = await seedCategory();
    const res = await request.delete(`/api/categories/${cat.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });

  it('should cascade-delete bottles', async () => {
    const cat = await seedCategory();
    await seedBottle({ categoryId: cat.id });
    await request.delete(`/api/categories/${cat.id}`).set(authHeader());
    const bottles = await prisma.bottle.findMany({ where: { categoryId: cat.id } });
    expect(bottles).toHaveLength(0);
  });
});
