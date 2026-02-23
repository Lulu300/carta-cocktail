import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedIngredient,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/ingredients', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/ingredients');
    expect(res.status).toBe(401);
  });

  it('should return all ingredients sorted by name', async () => {
    await seedIngredient({ name: 'Sugar' });
    await seedIngredient({ name: 'Lime' });

    const res = await request.get('/api/ingredients').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Lime');
    expect(res.body[1].name).toBe('Sugar');
  });
});

describe('GET /api/ingredients/:id', () => {
  it('should return 404 for non-existent ingredient', async () => {
    const res = await request.get('/api/ingredients/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return ingredient', async () => {
    const ing = await seedIngredient({ name: 'Mint' });
    const res = await request.get(`/api/ingredients/${ing.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Mint');
  });
});

describe('POST /api/ingredients', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/ingredients').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('should create ingredient', async () => {
    const res = await request.post('/api/ingredients').set(authHeader())
      .send({ name: 'Basil', icon: '🌿' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Basil');
    expect(res.body.icon).toBe('🌿');
    expect(res.body.isAvailable).toBe(true);
  });

  it('should return 409 for duplicate name', async () => {
    await seedIngredient({ name: 'Lime' });
    const res = await request.post('/api/ingredients').set(authHeader())
      .send({ name: 'Lime' });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/ingredients/:id', () => {
  it('should update ingredient name', async () => {
    const ing = await seedIngredient({ name: 'Old' });
    const res = await request.put(`/api/ingredients/${ing.id}`).set(authHeader())
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
  });

  it('should update isAvailable', async () => {
    const ing = await seedIngredient({ isAvailable: true });
    const res = await request.put(`/api/ingredients/${ing.id}`).set(authHeader())
      .send({ isAvailable: false });
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);
  });

  it('should return 409 for duplicate name on update', async () => {
    await seedIngredient({ name: 'Lime' });
    const ing = await seedIngredient({ name: 'Lemon' });
    const res = await request.put(`/api/ingredients/${ing.id}`).set(authHeader())
      .send({ name: 'Lime' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/ingredients/bulk-availability', () => {
  it('should return 400 if available is not boolean', async () => {
    const res = await request.post('/api/ingredients/bulk-availability').set(authHeader())
      .send({ available: 'yes' });
    expect(res.status).toBe(400);
  });

  it('should set all ingredients to available', async () => {
    await seedIngredient({ name: 'A', isAvailable: false });
    await seedIngredient({ name: 'B', isAvailable: false });

    const res = await request.post('/api/ingredients/bulk-availability').set(authHeader())
      .send({ available: true });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const ings = await prisma.ingredient.findMany();
    expect(ings.every(i => i.isAvailable)).toBe(true);
  });

  it('should set all ingredients to unavailable', async () => {
    await seedIngredient({ name: 'A', isAvailable: true });
    const res = await request.post('/api/ingredients/bulk-availability').set(authHeader())
      .send({ available: false });
    expect(res.status).toBe(200);

    const ings = await prisma.ingredient.findMany();
    expect(ings.every(i => !i.isAvailable)).toBe(true);
  });
});

describe('DELETE /api/ingredients/:id', () => {
  it('should delete an ingredient', async () => {
    const ing = await seedIngredient({ name: 'Basil' });
    const res = await request.delete(`/api/ingredients/${ing.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });
});
