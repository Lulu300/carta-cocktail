import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

describe('GET /api/menu-sections/menu/:menuId/sections', () => {
  it('should return empty array for menu with no sections', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.get(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return sections ordered by position', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    await prisma.menuSection.createMany({
      data: [
        { menuId: menu!.id, name: 'Second', position: 1 },
        { menuId: menu!.id, name: 'First', position: 0 },
      ],
    });

    const res = await request.get(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('First');
    expect(res.body[1].name).toBe('Second');
  });
});

describe('POST /api/menu-sections/menu/:menuId/sections', () => {
  it('should return 400 if name is missing', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.post(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it('should create section with auto position', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.post(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader())
      .send({ name: 'Classics' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Classics');
    expect(res.body.position).toBe(0);
  });

  it('should auto-increment position', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    await request.post(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader())
      .send({ name: 'First' });
    const res = await request.post(`/api/menu-sections/menu/${menu!.id}/sections`).set(authHeader())
      .send({ name: 'Second' });
    expect(res.status).toBe(201);
    expect(res.body.position).toBe(1);
  });
});

describe('PUT /api/menu-sections/sections/:id', () => {
  it('should update section name', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const section = await prisma.menuSection.create({
      data: { menuId: menu!.id, name: 'Old', position: 0 },
    });

    const res = await request.put(`/api/menu-sections/sections/${section.id}`).set(authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('should update section position', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const section = await prisma.menuSection.create({
      data: { menuId: menu!.id, name: 'Test', position: 0 },
    });

    const res = await request.put(`/api/menu-sections/sections/${section.id}`).set(authHeader())
      .send({ position: 5 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(5);
  });
});

describe('DELETE /api/menu-sections/sections/:id', () => {
  it('should delete a section', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const section = await prisma.menuSection.create({
      data: { menuId: menu!.id, name: 'ToDelete', position: 0 },
    });

    const res = await request.delete(`/api/menu-sections/sections/${section.id}`).set(authHeader());
    expect(res.status).toBe(200);
    const check = await prisma.menuSection.findUnique({ where: { id: section.id } });
    expect(check).toBeNull();
  });
});

describe('POST /api/menu-sections/menu/:menuId/sections/reorder', () => {
  it('should return 400 if sectionIds is not an array', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const res = await request.post(`/api/menu-sections/menu/${menu!.id}/sections/reorder`).set(authHeader())
      .send({ sectionIds: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('should reorder sections', async () => {
    const menu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const s1 = await prisma.menuSection.create({ data: { menuId: menu!.id, name: 'A', position: 0 } });
    const s2 = await prisma.menuSection.create({ data: { menuId: menu!.id, name: 'B', position: 1 } });

    const res = await request.post(`/api/menu-sections/menu/${menu!.id}/sections/reorder`).set(authHeader())
      .send({ sectionIds: [s2.id, s1.id] });
    expect(res.status).toBe(200);

    const updated1 = await prisma.menuSection.findUnique({ where: { id: s1.id } });
    const updated2 = await prisma.menuSection.findUnique({ where: { id: s2.id } });
    expect(updated2!.position).toBe(0);
    expect(updated1!.position).toBe(1);
  });
});
