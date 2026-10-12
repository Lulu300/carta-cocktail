import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory, seedBottle, seedMenu, addBottleToMenu,
  excludeBottleFromMenu, findSystemMenu,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

async function bottleIdsOf(menuId: number): Promise<number[]> {
  const entries = await prisma.menuBottle.findMany({ where: { menuId }, orderBy: { position: 'asc' } });
  return entries.map((entry) => entry.bottleId);
}

async function excludedIdsOf(menuId: number): Promise<number[]> {
  const exclusions = await prisma.menuBottleExclusion.findMany({ where: { menuId }, orderBy: { bottleId: 'asc' } });
  return exclusions.map((exclusion) => exclusion.bottleId);
}

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

  it('should return 400 for an unknown menu', async () => {
    const bottle = await seedBottle({ isApero: true });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: 9999, bottleId: bottle.id });
    expect(res.status).toBe(400);
  });

  it('should add a checked bottle to a personal menu', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id });
    expect(res.status).toBe(201);
    expect(res.body.menuId).toBe(menu.id);
    expect(res.body.bottleId).toBe(bottle.id);
    expect(res.body.bottle.category).toBeDefined();
  });

  it('should return 400 for a bottle not checked for the menu type', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isDigestif: true });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This bottle cannot go in this menu: only bottles checked for the menu\'s type (aperitif or digestif) can');
    expect(await prisma.menuBottle.count()).toBe(0);
  });

  it('should return 400 for a cocktail menu', async () => {
    const menu = await seedMenu();
    const bottle = await seedBottle({ isApero: true });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id });
    expect(res.status).toBe(400);
  });

  it('should return 400 for a system menu, whose bottles follow their flags', async () => {
    const menu = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: true });
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id });
    expect(res.status).toBe(400);
    expect(await prisma.menuBottle.count()).toBe(0);
  });

  it('should return 409 for duplicate bottle in menu', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });
    await addBottleToMenu(menu.id, bottle.id);
    const res = await request.post('/api/menu-bottles').set(authHeader())
      .send({ menuId: menu.id, bottleId: bottle.id });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/menu-bottles/:id', () => {
  it('should update position and isHidden', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const bottle = await seedBottle();
    const mb = await addBottleToMenu(menu!.id, bottle.id);

    const res = await request.put(`/api/menu-bottles/${mb.id}`).set(authHeader())
      .send({ position: 5, isHidden: true });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(5);
    expect(res.body.isHidden).toBe(true);
  });
});

describe('DELETE /api/menu-bottles/:id', () => {
  it('should return 404 for an unknown entry', async () => {
    const res = await request.delete('/api/menu-bottles/9999').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('should exclude the bottle from a system menu only', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const digestifs = await findSystemMenu('digestifs');
    const bottle = await seedBottle({ isApero: true, isDigestif: true });
    const mb = await addBottleToMenu(aperitifs.id, bottle.id);
    await addBottleToMenu(digestifs.id, bottle.id);

    const res = await request.delete(`/api/menu-bottles/${mb.id}`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Bottle removed from the menu');
    expect(await bottleIdsOf(aperitifs.id)).toEqual([]);
    expect(await excludedIdsOf(aperitifs.id)).toEqual([bottle.id]);
    expect(await bottleIdsOf(digestifs.id)).toEqual([bottle.id]);
    expect(await excludedIdsOf(digestifs.id)).toEqual([]);
  });

  it('should simply remove the bottle from a personal menu', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });
    const mb = await addBottleToMenu(menu.id, bottle.id);

    const res = await request.delete(`/api/menu-bottles/${mb.id}`).set(authHeader());

    expect(res.status).toBe(200);
    expect(await bottleIdsOf(menu.id)).toEqual([]);
    expect(await prisma.menuBottleExclusion.count()).toBe(0);
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
    expect(res.body.error).toBe('A cocktail menu has no bottles to synchronize');
  });

  it('should return 400 for a personal menu and leave it unchanged', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    await seedBottle({ isApero: true });
    const res = await request.post(`/api/menu-bottles/menu/${menu.id}/sync`).set(authHeader());
    expect(res.status).toBe(400);
    expect(await bottleIdsOf(menu.id)).toEqual([]);
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
    expect(res.body.message).toBe('Menu synchronized with the bottles');

    // Verify apero bottle is in menu
    const mbs = await prisma.menuBottle.findMany({ where: { menuId: menu!.id } });
    expect(mbs.some(mb => mb.bottleId === aperoBottle.id)).toBe(true);
    expect(mbs.some(mb => mb.bottleId === nonAperoBottle.id)).toBe(false);
  });

  it('should keep an empty checked bottle and leave out an excluded one', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const empty = await seedBottle({ isApero: true, remainingPercent: 0 });
    const excluded = await seedBottle({ isApero: true });
    await excludeBottleFromMenu(aperitifs.id, excluded.id);

    const res = await request.post(`/api/menu-bottles/menu/${aperitifs.id}/sync`).set(authHeader());

    expect(res.status).toBe(200);
    expect(await bottleIdsOf(aperitifs.id)).toEqual([empty.id]);
  });
});

describe('GET /api/menu-bottles/menu/:menuId/exclusions', () => {
  it('should list the excluded bottles with their category, by name', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const spritz = await seedBottle({ name: 'Spritz', isApero: true });
    const aperol = await seedBottle({ name: 'Aperol', isApero: true });
    await excludeBottleFromMenu(aperitifs.id, spritz.id);
    await excludeBottleFromMenu(aperitifs.id, aperol.id);

    const res = await request.get(`/api/menu-bottles/menu/${aperitifs.id}/exclusions`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.map((exclusion: { bottle: { name: string } }) => exclusion.bottle.name)).toEqual(['Aperol', 'Spritz']);
    expect(res.body[0].bottle.category).toBeDefined();
  });

  it('should return an empty list for a personal menu', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const res = await request.get(`/api/menu-bottles/menu/${menu.id}/exclusions`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/menu-bottles/menu/:menuId/exclusions', () => {
  it('should exclude several bottles of a system menu at once', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const [a, b, c] = [await seedBottle({ isApero: true }), await seedBottle({ isApero: true }), await seedBottle({ isApero: true })];
    await addBottleToMenu(aperitifs.id, a.id, { position: 0 });
    await addBottleToMenu(aperitifs.id, b.id, { position: 1 });
    await addBottleToMenu(aperitifs.id, c.id, { position: 2 });

    const res = await request.post(`/api/menu-bottles/menu/${aperitifs.id}/exclusions`).set(authHeader())
      .send({ bottleIds: [a.id, b.id] });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Bottles removed from the menu');
    expect(await excludedIdsOf(aperitifs.id)).toEqual([a.id, b.id]);
    expect(await bottleIdsOf(aperitifs.id)).toEqual([c.id]);
  });

  it('should ignore a bottle that is not in the menu or already excluded', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const excluded = await seedBottle({ isApero: true });
    const absent = await seedBottle({ isApero: true });
    await excludeBottleFromMenu(aperitifs.id, excluded.id);

    const res = await request.post(`/api/menu-bottles/menu/${aperitifs.id}/exclusions`).set(authHeader())
      .send({ bottleIds: [excluded.id, absent.id] });

    expect(res.status).toBe(200);
    expect(await excludedIdsOf(aperitifs.id)).toEqual([excluded.id]);
  });

  it('should return 400 for a personal menu', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });
    await addBottleToMenu(menu.id, bottle.id);

    const res = await request.post(`/api/menu-bottles/menu/${menu.id}/exclusions`).set(authHeader())
      .send({ bottleIds: [bottle.id] });

    expect(res.status).toBe(400);
    expect(await bottleIdsOf(menu.id)).toEqual([bottle.id]);
  });

  it('should return 400 for an empty list of bottles', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const res = await request.post(`/api/menu-bottles/menu/${aperitifs.id}/exclusions`).set(authHeader())
      .send({ bottleIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('body.bottleIds');
  });
});

describe('DELETE /api/menu-bottles/menu/:menuId/exclusions/:bottleId', () => {
  it('should put the bottle back at the end of the menu', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const listed = await seedBottle({ isApero: true });
    const excluded = await seedBottle({ isApero: true });
    await addBottleToMenu(aperitifs.id, listed.id, { position: 3 });
    await excludeBottleFromMenu(aperitifs.id, excluded.id);

    const res = await request.delete(`/api/menu-bottles/menu/${aperitifs.id}/exclusions/${excluded.id}`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Bottle put back in the menu');
    expect(await bottleIdsOf(aperitifs.id)).toEqual([listed.id, excluded.id]);
    expect(await excludedIdsOf(aperitifs.id)).toEqual([]);
  });

  it('should return 404 for an unknown exclusion', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: true });
    const res = await request.delete(`/api/menu-bottles/menu/${aperitifs.id}/exclusions/${bottle.id}`).set(authHeader());
    expect(res.status).toBe(404);
  });
});
