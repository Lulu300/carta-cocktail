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

describe('POST /api/bottles (batch)', () => {
  it('should create multiple bottles when quantity > 1', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Beer', categoryId: cat.id, capacityMl: 330, quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].name).toBe('Beer');
    expect(res.body[1].name).toBe('Beer');
    expect(res.body[2].name).toBe('Beer');
  });

  it('should return single bottle (not array) when quantity is 1', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Wine', categoryId: cat.id, capacityMl: 750, quantity: 1 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Wine');
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('should cap quantity at 50', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Shot', categoryId: cat.id, capacityMl: 50, quantity: 100 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(50);
  });

  it('should auto-sync menus for all batch-created bottles', async () => {
    const cat = await seedCategory();
    const res = await request.post('/api/bottles').set(authHeader())
      .send({ name: 'Aperol', categoryId: cat.id, capacityMl: 700, isApero: true, quantity: 3 });
    expect(res.status).toBe(201);

    const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const menuBottles = await prisma.menuBottle.findMany({
      where: { menuId: aperoMenu!.id },
    });
    expect(menuBottles).toHaveLength(3);
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

describe('GET /api/bottles/export', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/bottles/export');
    expect(res.status).toBe(401);
  });

  it('should return 400 for unsupported format', async () => {
    const res = await request.get('/api/bottles/export?format=xml').set(authHeader());
    expect(res.status).toBe(400);
  });

  it('should default to JSON when no format is given', async () => {
    const res = await request.get('/api/bottles/export').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 1, bottles: [], categories: [] });
    expect(res.body.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.headers['content-disposition']).toMatch(/bottles-\d{4}-\d{2}-\d{2}\.json/);
  });

  it('should export a single bottle as JSON with its category', async () => {
    const cat = await seedCategory({ name: 'Rhum', type: 'SPIRIT', desiredStock: 2, minimumPercent: 25 });
    await seedBottle({ name: 'Havana Club 7', categoryId: cat.id, capacityMl: 700, remainingPercent: 80 });

    const res = await request.get('/api/bottles/export?format=json').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0]).toMatchObject({
      name: 'Rhum', type: 'SPIRIT', desiredStock: 2, minimumPercent: 25,
    });
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0]).toMatchObject({
      name: 'Havana Club 7', categoryName: 'Rhum',
      capacityMl: 700, remainingPercent: 80, quantity: 1,
    });
  });

  it('should aggregate identical bottles into a single row with quantity', async () => {
    const cat = await seedCategory({ name: 'Beer' });
    await seedBottle({ name: 'Heineken', categoryId: cat.id, capacityMl: 330, remainingPercent: 100 });
    await seedBottle({ name: 'Heineken', categoryId: cat.id, capacityMl: 330, remainingPercent: 100 });
    await seedBottle({ name: 'Heineken', categoryId: cat.id, capacityMl: 330, remainingPercent: 100 });

    const res = await request.get('/api/bottles/export').set(authHeader());
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].quantity).toBe(3);
    expect(res.body.bottles[0].name).toBe('Heineken');
  });

  it('should not aggregate bottles with different remainingPercent', async () => {
    const cat = await seedCategory({ name: 'Whisky' });
    await seedBottle({ name: 'Jack', categoryId: cat.id, capacityMl: 700, remainingPercent: 100 });
    await seedBottle({ name: 'Jack', categoryId: cat.id, capacityMl: 700, remainingPercent: 50 });

    const res = await request.get('/api/bottles/export').set(authHeader());
    expect(res.body.bottles).toHaveLength(2);
    const sorted = [...res.body.bottles].sort((a: any, b: any) => b.remainingPercent - a.remainingPercent);
    expect(sorted[0].remainingPercent).toBe(100);
    expect(sorted[0].quantity).toBe(1);
    expect(sorted[1].remainingPercent).toBe(50);
    expect(sorted[1].quantity).toBe(1);
  });

  it('should include parsed nameTranslations on categories', async () => {
    const cat = await seedCategory({
      name: 'Rhum',
      nameTranslations: JSON.stringify({ fr: 'Rhum', en: 'Rum' }),
    });
    await seedBottle({ categoryId: cat.id });

    const res = await request.get('/api/bottles/export').set(authHeader());
    expect(res.body.categories[0].nameTranslations).toEqual({ fr: 'Rhum', en: 'Rum' });
  });

  it('should filter by categoryId', async () => {
    const cat1 = await seedCategory({ name: 'Gin' });
    const cat2 = await seedCategory({ name: 'Vodka' });
    await seedBottle({ name: 'Bombay', categoryId: cat1.id });
    await seedBottle({ name: 'Absolut', categoryId: cat2.id });

    const res = await request.get(`/api/bottles/export?categoryId=${cat1.id}`).set(authHeader());
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].name).toBe('Bombay');
    expect(res.body.categories).toHaveLength(1);
  });

  it('should filter by category type', async () => {
    const spirit = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    const syrup = await seedCategory({ name: 'Grenadine', type: 'SYRUP' });
    await seedBottle({ name: 'Havana', categoryId: spirit.id });
    await seedBottle({ name: 'Monin', categoryId: syrup.id });

    const res = await request.get('/api/bottles/export?type=SYRUP').set(authHeader());
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].name).toBe('Monin');
  });

  it('should filter by search on bottle name', async () => {
    const cat = await seedCategory();
    await seedBottle({ name: 'Bombay Sapphire', categoryId: cat.id });
    await seedBottle({ name: 'Hendricks', categoryId: cat.id });

    const res = await request.get('/api/bottles/export?search=bombay').set(authHeader());
    expect(res.body.bottles).toHaveLength(1);
    expect(res.body.bottles[0].name).toBe('Bombay Sapphire');
  });

  it('should export as CSV with correct headers and content', async () => {
    const cat = await seedCategory({ name: 'Rhum', type: 'SPIRIT' });
    await seedBottle({
      name: 'Havana', categoryId: cat.id, capacityMl: 700,
      remainingPercent: 90, isApero: true,
    });

    const res = await request.get('/api/bottles/export?format=csv').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/bottles-\d{4}-\d{2}-\d{2}\.csv/);

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'name,categoryName,categoryType,capacityMl,quantity,remainingPercent,alcoholPercentage,purchasePrice,location,openedAt,isApero,isDigestif'
    );
    expect(lines[1]).toContain('Havana,Rhum,SPIRIT,700,1,90');
    expect(lines[1]).toContain('true');
  });

  it('should escape CSV fields containing commas or quotes', async () => {
    const cat = await seedCategory({ name: 'Wine' });
    await seedBottle({
      name: 'Château "Margaux", 2015',
      categoryId: cat.id,
      capacityMl: 750,
      location: 'Cave, étagère 3',
    });

    const res = await request.get('/api/bottles/export?format=csv').set(authHeader());
    const lines = res.text.trim().split('\n');
    expect(lines[1]).toContain('"Château ""Margaux"", 2015"');
    expect(lines[1]).toContain('"Cave, étagère 3"');
  });

  it('should aggregate identical bottles in CSV output', async () => {
    const cat = await seedCategory({ name: 'Beer' });
    await seedBottle({ name: 'Heineken', categoryId: cat.id, capacityMl: 330 });
    await seedBottle({ name: 'Heineken', categoryId: cat.id, capacityMl: 330 });

    const res = await request.get('/api/bottles/export?format=csv').set(authHeader());
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain('Heineken,Beer,SPIRIT,330,2,');
  });
});
