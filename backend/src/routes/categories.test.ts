import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle, seedUnit, seedCocktailUsing,
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

  it('should create with default desiredStock=1 and minimumPercent=30', async () => {
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'Gin', type: 'SPIRIT' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Gin');
    expect(res.body.desiredStock).toBe(1);
    expect(res.body.minimumPercent).toBe(30);
  });

  it('should create with custom minimumPercent', async () => {
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'Rum', type: 'SPIRIT', minimumPercent: 50 });
    expect(res.status).toBe(201);
    expect(res.body.minimumPercent).toBe(50);
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

  it('should return 409 when the name exists with another case', async () => {
    await seedCategory({ name: 'Rhum' });
    const res = await request.post('/api/categories').set(authHeader())
      .send({ name: 'rhum', type: 'SPIRIT' });
    expect(res.status).toBe(409);
    expect(await prisma.category.count()).toBe(1);
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

  it('should return 409 when renaming to the name of another category, ignoring case', async () => {
    await seedCategory({ name: 'Gin' });
    const cat = await seedCategory({ name: 'Vodka' });
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ name: 'GIN' });
    expect(res.status).toBe(409);
  });

  it('should allow changing only the case of its own name', async () => {
    const cat = await seedCategory({ name: 'gin' });
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ name: 'Gin' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Gin');
  });

  it('should update desiredStock', async () => {
    const cat = await seedCategory();
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ desiredStock: 5 });
    expect(res.status).toBe(200);
    expect(res.body.desiredStock).toBe(5);
  });

  it('should update minimumPercent', async () => {
    const cat = await seedCategory();
    const res = await request.put(`/api/categories/${cat.id}`).set(authHeader())
      .send({ minimumPercent: 50 });
    expect(res.status).toBe(200);
    expect(res.body.minimumPercent).toBe(50);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('should delete a category', async () => {
    const cat = await seedCategory();
    const res = await request.delete(`/api/categories/${cat.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });

  it('should refuse with 409 to delete a category that holds bottles', async () => {
    const cat = await seedCategory();
    const bottle = await seedBottle({ categoryId: cat.id, name: 'Kept' });
    const res = await request.delete(`/api/categories/${cat.id}`).set(authHeader());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot delete: this category still contains bottles');
    expect(res.body.details).toEqual({ cocktails: [], bottles: [{ id: bottle.id, name: 'Kept' }] });
    expect(await prisma.bottle.count({ where: { categoryId: cat.id } })).toBe(1);
  });

  it('should refuse with 409 to delete a category used by a recipe', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    await seedCocktailUsing('Mojito', unit.id, [{ sourceType: 'CATEGORY', categoryId: cat.id }]);
    const res = await request.delete(`/api/categories/${cat.id}`).set(authHeader());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot delete: this item is used by cocktail recipes');
    expect(res.body.details.cocktails[0].name).toBe('Mojito');
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).not.toBeNull();
  });

  it('should force the deletion of a used category with its bottles and recipe lines', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory({ name: 'Rum' });
    const other = await seedCategory({ name: 'Lime' });
    const bottle = await seedBottle({ categoryId: cat.id, name: 'Dark rum' });
    const mojito = await seedCocktailUsing('Mojito', unit.id, [
      { sourceType: 'CATEGORY', categoryId: cat.id, preferredBottleIds: [bottle.id] },
      { sourceType: 'CATEGORY', categoryId: other.id },
    ]);
    const punch = await seedCocktailUsing('Punch', unit.id, [{ sourceType: 'BOTTLE', bottleId: bottle.id }]);

    const res = await request.delete(`/api/categories/${cat.id}?force=true`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.impact).toEqual({
      cocktails: [
        { id: mojito.id, name: 'Mojito', removedLines: 1 },
        { id: punch.id, name: 'Punch', removedLines: 1 },
      ],
      bottles: [{ id: bottle.id, name: 'Dark rum' }],
    });
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
    expect(await prisma.bottle.count()).toBe(0);
    expect(await prisma.cocktailIngredient.findMany({ select: { categoryId: true } }))
      .toEqual([{ categoryId: other.id }]);
  });

  it('should delete nothing when the forced deletion fails midway', async () => {
    const unit = await seedUnit();
    const cat = await seedCategory();
    await seedBottle({ categoryId: cat.id });
    await seedCocktailUsing('Mojito', unit.id, [{ sourceType: 'CATEGORY', categoryId: cat.id }]);
    // Fails the last statement of the transaction, after bottles and lines are deleted
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_category_delete BEFORE DELETE ON Category BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`,
    );
    try {
      const res = await request.delete(`/api/categories/${cat.id}?force=true`).set(authHeader());
      // SQLite reports the trigger abort as a constraint failure: any error status will do
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_category_delete');
    }
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.bottle.count()).toBe(1);
    expect(await prisma.cocktailIngredient.count()).toBe(1);
  });
});
