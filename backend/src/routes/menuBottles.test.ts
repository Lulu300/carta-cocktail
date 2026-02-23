import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/menu-bottles/menu/:menuId', () => {
  it('should return bottles for a menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.get(`/api/menu-bottles/menu/${menu!.id}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/menu-bottles', () => {
  it('should return 400 if menuId is missing', async () => {
    const bottle = await seedBottle();
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ bottleId: bottle.id });
    expect(res.status).toBe(400);
  });

  it('should return 400 if bottleId is missing', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu!.id });
    expect(res.status).toBe(400);
  });

  it('should add bottle to menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const bottle = await seedBottle();
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu!.id, bottleId: bottle.id });
    expect(res.status).toBe(201);
    expect(res.body.menuId).toBe(menu!.id);
    expect(res.body.bottleId).toBe(bottle.id);
  });

  it('should return 409 for duplicate bottle in menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const bottle = await seedBottle();
    await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu!.id, bottleId: bottle.id });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu!.id, bottleId: bottle.id });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/menu-bottles/:id', () => {
  it('should update position and isHidden', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const bottle = await seedBottle();
    const mb = await prisma.menuBottle.create({
      data: { menuId: menu!.id, bottleId: bottle.id, position: 0 },
    });

    const res = await request.put(`/api/menu-bottles/${mb.id}`).set(authHeader())
      .send({ position: 5, isHidden: true });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(5);
    expect(res.body.isHidden).toBe(true);
  });
});

describe('DELETE /api/menu-bottles/:id', () => {
  it('should remove bottle from menu', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const bottle = await seedBottle();
    const mb = await prisma.menuBottle.create({
      data: { menuId: menu!.id, bottleId: bottle.id, position: 0 },
    });

    const res = await request.delete(`/api/menu-bottles/${mb.id}`).set(authHeader());
    expect(res.status).toBe(200);
  });
});

describe('POST /api/menu-bottles/menu/:menuId/sync', () => {
  it('should return 404 for non-existent menu', async () => {
    const res = await request.post('/api/menu-bottles/menu/9999/sync').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should return 400 for cocktail-type menu', async () => {
    const menu = await prisma.menu.create({
      data: { name: 'Cocktails', slug: 'cocktails-menu', type: 'COCKTAILS' },
    });
    const res = await request.post(`/api/menu-bottles/menu/${menu.id}/sync`).set(authHeader());
    expect(res.status).toBe(400);
  });

  it('should add apero bottles and remove non-apero bottles', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const cat = await seedCategory();

    // Create an apero bottle (should be added)
    const aperoBottle = await seedBottle({ name: 'Campari', categoryId: cat.id, isApero: true });
    // Create a non-apero bottle already in menu (should be removed)
    const nonAperoBottle = await seedBottle({ name: 'Whiskey', categoryId: cat.id, isApero: false });
    await prisma.menuBottle.create({
      data: { menuId: menu!.id, bottleId: nonAperoBottle.id, position: 0 },
    });

    const res = await request.post(`/api/menu-bottles/menu/${menu!.id}/sync`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(res.body.removed).toBe(1);

    // Verify apero bottle is in menu
    const mbs = await prisma.menuBottle.findMany({ where: { menuId: menu!.id } });
    expect(mbs.some(mb => mb.bottleId === aperoBottle.id)).toBe(true);
    expect(mbs.some(mb => mb.bottleId === nonAperoBottle.id)).toBe(false);
  });
});
