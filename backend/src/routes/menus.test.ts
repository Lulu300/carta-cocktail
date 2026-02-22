import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCocktail,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/menus', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/menus');
    expect(res.status).toBe(401);
  });

  it('should return all menus with counts', async () => {
    const res = await request.get('/api/menus').set(authHeader());
    expect(res.status).toBe(200);
    // Default menus: aperitifs and digestifs
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]._count).toBeDefined();
  });
});

describe('GET /api/menus/:id', () => {
  it('should return 404 for non-existent menu', async () => {
    const res = await request.get('/api/menus/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return menu with sections, cocktails, bottles', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.get(`/api/menus/${menu!.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sections');
    expect(res.body).toHaveProperty('cocktails');
    expect(res.body).toHaveProperty('bottles');
  });
});

describe('POST /api/menus', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/menus').set(authHeader()).send({ slug: 'test' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if slug is missing', async () => {
    const res = await request.post('/api/menus').set(authHeader()).send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('should create menu with sanitized slug', async () => {
    const res = await request.post('/api/menus').set(authHeader())
      .send({ name: 'My Menu', slug: 'My Menu!!!' });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('my-menu---');
    expect(res.body.type).toBe('COCKTAILS');
  });

  it('should return 409 for duplicate slug', async () => {
    const res = await request.post('/api/menus').set(authHeader())
      .send({ name: 'Aperos', slug: 'aperitifs' });
    expect(res.status).toBe(409);
  });

  it('should default type to COCKTAILS', async () => {
    const res = await request.post('/api/menus').set(authHeader())
      .send({ name: 'Summer', slug: 'summer' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('COCKTAILS');
  });
});

describe('PUT /api/menus/:id', () => {
  it('should update menu name', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Old', slug: 'old', type: 'COCKTAILS' },
    });
    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('should update cocktails associations', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Test', slug: 'test-menu', type: 'COCKTAILS' },
    });
    const cocktail = await seedCocktail({ name: 'Mojito' });

    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ cocktails: [{ cocktailId: cocktail.id, position: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.cocktails).toHaveLength(1);
    expect(res.body.cocktails[0].cocktailId).toBe(cocktail.id);
  });
});

describe('DELETE /api/menus/:id', () => {
  it('should return 404 for non-existent menu', async () => {
    const res = await request.delete('/api/menus/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return 403 when deleting aperitifs menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.delete(`/api/menus/${menu!.id}`).set(authHeader());
    expect(res.status).toBe(403);
  });

  it('should return 403 when deleting digestifs menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'digestifs' } });
    const res = await request.delete(`/api/menus/${menu!.id}`).set(authHeader());
    expect(res.status).toBe(403);
  });

  it('should delete a custom menu', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Custom', slug: 'custom', type: 'COCKTAILS' },
    });
    const res = await request.delete(`/api/menus/${menu.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });
});
