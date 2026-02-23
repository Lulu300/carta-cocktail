import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/bottles', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/bottles');
    expect(res.status).toBe(401);
  });

  it('should return all bottles with category', async () => {
    const cat = await seedCategory({ name: 'Vodka' });
    await seedBottle({ name: 'Absolut', categoryId: cat.id });

    const res = await request.get('/api/bottles').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Absolut');
    expect(res.body[0].category.name).toBe('Vodka');
  });

  it('should filter by categoryId', async () => {
    const cat1 = await seedCategory({ name: 'Rum' });
    const cat2 = await seedCategory({ name: 'Gin' });
    await seedBottle({ name: 'Havana', categoryId: cat1.id });
    await seedBottle({ name: 'Bombay', categoryId: cat2.id });

    const res = await request.get(`/api/bottles?categoryId=${cat1.id}`).set(authHeader());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Havana');
  });

  it('should filter by type', async () => {
    const catSpirit = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    const catSyrup = await seedCategory({ name: 'Grenadine', type: 'SYRUP' });
    await seedBottle({ name: 'Havana', categoryId: catSpirit.id });
    await seedBottle({ name: 'Monin', categoryId: catSyrup.id });

    const res = await request.get('/api/bottles?type=SYRUP').set(authHeader());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Monin');
  });
});

describe('GET /api/bottles/:id', () => {
  it('should return 404 for non-existent bottle', async () => {
    const res = await request.get('/api/bottles/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return bottle with category', async () => {
    const cat = await seedCategory({ name: 'Rum' });
    const bottle = await seedBottle({ name: 'Havana', categoryId: cat.id });

    const res = await request.get(`/api/bottles/${bottle.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Havana');
    expect(res.body.category.name).toBe('Rum');
  });
});

describe('POST /api/bottles', () => {
  it('should return 400 if name is missing', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ categoryId: cat.id, capacityMl: 700 });
    expect(res.status).toBe(400);
  });

  it('should return 400 if capacityMl is missing', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Test', categoryId: cat.id });
    expect(res.status).toBe(400);
  });

  it('should create with defaults', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Absolut', categoryId: cat.id, capacityMl: 700 });
    expect(res.status).toBe(201);
    expect(res.body.remainingPercent).toBe(100);
    expect(res.body.isApero).toBe(false);
    expect(res.body.isDigestif).toBe(false);
  });

  it('should auto-add to aperitifs menu when isApero=true', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Campari', categoryId: cat.id, capacityMl: 700, isApero: true });
    expect(res.status).toBe(201);

    const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const menuBottle = await prisma.menuBottle.findFirst({
      where: { menuId: aperoMenu!.id, bottleId: res.body.id },
    });
    expect(menuBottle).not.toBeNull();
  });

  it('should auto-add to digestifs menu when isDigestif=true', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Cognac', categoryId: cat.id, capacityMl: 700, isDigestif: true });
    expect(res.status).toBe(201);

    const digestifMenu = await prisma.menu.findUnique({ where: { slug: 'digestifs' } });
    const menuBottle = await prisma.menuBottle.findFirst({
      where: { menuId: digestifMenu!.id, bottleId: res.body.id },
    });
    expect(menuBottle).not.toBeNull();
  });
});

describe('PUT /api/bottles/:id', () => {
  it('should update bottle fields', async () => {
    const bottle = await seedBottle({ name: 'Old Name' });
    const res = await request.put(`/api/bottles/${bottle.id}`).set(authHeader())
      .send({ name: 'New Name', remainingPercent: 50 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.remainingPercent).toBe(50);
  });

  it('should sync to aperitifs menu when isApero changes to true', async () => {
    const bottle = await seedBottle({ isApero: false });
    await request.put(`/api/bottles/${bottle.id}`).set(authHeader())
      .send({ isApero: true });

    const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const mb = await prisma.menuBottle.findFirst({
      where: { menuId: aperoMenu!.id, bottleId: bottle.id },
    });
    expect(mb).not.toBeNull();
  });

  it('should remove from aperitifs menu when isApero changes to false', async () => {
    const cat = await seedCategory();
    // Create bottle with isApero=true
    const createRes = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Campari', categoryId: cat.id, capacityMl: 700, isApero: true });
    const bottleId = createRes.body.id;

    // Now set isApero=false
    await request.put(`/api/bottles/${bottleId}`).set(authHeader())
      .send({ isApero: false });

    const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const mb = await prisma.menuBottle.findFirst({
      where: { menuId: aperoMenu!.id, bottleId },
    });
    expect(mb).toBeNull();
  });
});

describe('DELETE /api/bottles/:id', () => {
  it('should delete a bottle', async () => {
    const bottle = await seedBottle();
    const res = await request.delete(`/api/bottles/${bottle.id}`).set(authHeader());
    expect(res.status).toBe(200);
    const check = await prisma.bottle.findUnique({ where: { id: bottle.id } });
    expect(check).toBeNull();
  });
});
