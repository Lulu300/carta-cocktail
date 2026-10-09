import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCocktail, seedBottle,
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

describe('PUT /api/menus/:id - sections', () => {
  async function createMenuWithSection(slug: string) {
    const menu = await prisma.menu.create({ data: { name: slug, slug, type: 'COCKTAILS' } });
    const section = await prisma.menuSection.create({ data: { menuId: menu.id, name: 'Classics' } });
    return { menu, section };
  }

  it('should keep menuSectionId of cocktails', async () => {
    const { menu, section } = await createMenuWithSection('sections-cocktails');
    const mojito = await seedCocktail({ name: 'Mojito' });
    const negroni = await seedCocktail({ name: 'Negroni' });

    const put = await request.put(`/api/menus/${menu.id}`).set(authHeader()).send({
      cocktails: [
        { cocktailId: mojito.id, position: 0, menuSectionId: section.id },
        { cocktailId: negroni.id, position: 1, menuSectionId: null },
      ],
    });
    expect(put.status).toBe(200);

    const res = await request.get(`/api/menus/${menu.id}`).set(authHeader());
    const sectionByCocktail = Object.fromEntries(
      res.body.cocktails.map((mc: any) => [mc.cocktailId, mc.menuSectionId]),
    );
    expect(sectionByCocktail[mojito.id]).toBe(section.id);
    expect(sectionByCocktail[negroni.id]).toBeNull();
  });

  it('should keep menuSectionId of bottles', async () => {
    const { menu, section } = await createMenuWithSection('sections-bottles');
    const rum = await seedBottle({ name: 'Rum' });
    const gin = await seedBottle({ name: 'Gin' });

    const put = await request.put(`/api/menus/${menu.id}`).set(authHeader()).send({
      bottles: [
        { bottleId: rum.id, position: 0, menuSectionId: section.id },
        { bottleId: gin.id, position: 1 },
      ],
    });
    expect(put.status).toBe(200);

    const res = await request.get(`/api/menus/${menu.id}`).set(authHeader());
    const sectionByBottle = Object.fromEntries(
      res.body.bottles.map((mb: any) => [mb.bottleId, mb.menuSectionId]),
    );
    expect(sectionByBottle[rum.id]).toBe(section.id);
    expect(sectionByBottle[gin.id]).toBeNull();
  });

  it('should return 400 and keep associations for a section of another menu', async () => {
    const { menu } = await createMenuWithSection('target-menu');
    const { section: foreignSection } = await createMenuWithSection('other-menu');
    const mojito = await seedCocktail({ name: 'Mojito' });
    const negroni = await seedCocktail({ name: 'Negroni' });
    await prisma.menuCocktail.create({ data: { menuId: menu.id, cocktailId: mojito.id } });

    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader()).send({
      cocktails: [{ cocktailId: negroni.id, menuSectionId: foreignSection.id }],
    });
    expect(res.status).toBe(400);

    const remaining = await prisma.menuCocktail.findMany({ where: { menuId: menu.id } });
    expect(remaining.map((mc) => mc.cocktailId)).toEqual([mojito.id]);
  });
});

describe('PUT /api/menus/:id - atomicity', () => {
  it('should return 409 and keep associations when the slug is taken', async () => {
    const menuA = await prisma.menu.create({ data: { name: 'A', slug: 'menu-a', type: 'COCKTAILS' } });
    await prisma.menu.create({ data: { name: 'B', slug: 'taken', type: 'COCKTAILS' } });
    const mojito = await seedCocktail({ name: 'Mojito' });
    await prisma.menuCocktail.create({ data: { menuId: menuA.id, cocktailId: mojito.id } });

    const res = await request.put(`/api/menus/${menuA.id}`).set(authHeader())
      .send({ slug: 'taken', cocktails: [] });
    expect(res.status).toBe(409);

    const remaining = await prisma.menuCocktail.findMany({ where: { menuId: menuA.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].cocktailId).toBe(mojito.id);
  });

  it('should return 404 for a non-existent menu with cocktails in the body', async () => {
    const mojito = await seedCocktail({ name: 'Mojito' });
    const res = await request.put('/api/menus/9999').set(authHeader())
      .send({ cocktails: [{ cocktailId: mojito.id }] });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/menus/:id - system menus', () => {
  async function aperitifsMenu() {
    return (await prisma.menu.findUnique({ where: { slug: 'aperitifs' } }))!;
  }

  it('should return 403 when changing the slug of aperitifs', async () => {
    const menu = await aperitifsMenu();
    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ slug: 'renamed' });
    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe('errors.cannotModifySystemMenu');
    const unchanged = await prisma.menu.findUnique({ where: { id: menu.id } });
    expect(unchanged!.slug).toBe('aperitifs');
  });

  it('should return 403 when changing the type of aperitifs', async () => {
    const menu = await aperitifsMenu();
    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ type: 'COCKTAILS' });
    expect(res.status).toBe(403);
    const unchanged = await prisma.menu.findUnique({ where: { id: menu.id } });
    expect(unchanged!.type).toBe('APEROS');
  });

  it('should allow changing name, description and isPublic of aperitifs', async () => {
    const menu = await aperitifsMenu();
    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ name: 'Before dinner', description: 'Light drinks', isPublic: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Before dinner');
    expect(res.body.description).toBe('Light drinks');
    expect(res.body.isPublic).toBe(true);
  });

  it('should allow sending the unchanged slug and type of aperitifs', async () => {
    const menu = await aperitifsMenu();
    const res = await request.put(`/api/menus/${menu.id}`).set(authHeader())
      .send({ name: 'Aperitifs', slug: 'aperitifs', type: 'APEROS' });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('aperitifs');
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
    expect(res.body.error).not.toBe('errors.cannotDeleteDefaultMenu');
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
