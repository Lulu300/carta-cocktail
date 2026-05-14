import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AdmZip from 'adm-zip';
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

describe('POST /api/bottles/import/preview', () => {
  it('should return 401 without auth', async () => {
    const res = await request.post('/api/bottles/import/preview');
    expect(res.status).toBe(401);
  });

  it('should return 400 when no file is uploaded', async () => {
    const res = await request.post('/api/bottles/import/preview').set(authHeader());
    expect(res.status).toBe(400);
  });

  it('should return 400 for unsupported file format', async () => {
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from('whatever'), 'bottles.txt');
    expect(res.status).toBe(400);
  });

  it('should parse a JSON file and detect missing categories', async () => {
    const payload = {
      version: 1,
      categories: [{ name: 'Rhum', type: 'SPIRIT', desiredStock: 2, minimumPercent: 30, nameTranslations: null }],
      bottles: [{
        name: 'Havana 7', categoryName: 'Rhum', capacityMl: 700,
        remainingPercent: 80, alcoholPercentage: 40, purchasePrice: 28,
        location: null, openedAt: null, isApero: false, isDigestif: false, quantity: 2,
      }],
    };
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(JSON.stringify(payload)), 'bottles.json');

    expect(res.status).toBe(200);
    expect(res.body.payload.bottles).toHaveLength(1);
    expect(res.body.categories[0].status).toBe('missing');
    expect(res.body.bottles[0].needsCategory).toBe(false);
    expect(res.body.bottles[0].potentialDuplicates).toHaveLength(0);
  });

  it('should detect matched categories', async () => {
    await seedCategory({ name: 'Rhum', type: 'SPIRIT' });
    const payload = {
      version: 1,
      categories: [{ name: 'Rhum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null }],
      bottles: [{ name: 'Havana', categoryName: 'Rhum', capacityMl: 700, quantity: 1 }],
    };
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(JSON.stringify(payload)), 'bottles.json');

    expect(res.status).toBe(200);
    expect(res.body.categories[0].status).toBe('matched');
    expect(res.body.categories[0].existingMatch.name).toBe('Rhum');
  });

  it('should detect potential duplicates of existing bottles', async () => {
    const cat = await seedCategory({ name: 'Vodka' });
    await seedBottle({ name: 'Absolut', categoryId: cat.id, capacityMl: 700 });

    const payload = {
      version: 1,
      categories: [{ name: 'Vodka', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null }],
      bottles: [{ name: 'Absolut', categoryName: 'Vodka', capacityMl: 700, quantity: 1 }],
    };
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(JSON.stringify(payload)), 'bottles.json');

    expect(res.body.bottles[0].potentialDuplicates).toHaveLength(1);
    expect(res.body.bottles[0].potentialDuplicates[0].name).toBe('Absolut');
  });

  it('should flag bottles missing a category as needsCategory', async () => {
    const payload = {
      version: 1,
      bottles: [{ name: 'Mystery bottle', categoryName: '', capacityMl: 700, quantity: 1 }],
    };
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(JSON.stringify(payload)), 'bottles.json');

    expect(res.status).toBe(200);
    expect(res.body.bottles[0].needsCategory).toBe(true);
  });

  it('should parse a CSV file', async () => {
    const csv = [
      'name,categoryName,categoryType,capacityMl,quantity,remainingPercent,alcoholPercentage,purchasePrice,location,openedAt,isApero,isDigestif',
      'Havana 7,Rhum,SPIRIT,700,2,90,40,25,,,false,false',
      'Bombay,Gin,SPIRIT,750,1,100,47,30,Étagère 1,,true,false',
    ].join('\n');
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(csv), 'bottles.csv');

    expect(res.status).toBe(200);
    expect(res.body.payload.bottles).toHaveLength(2);
    expect(res.body.payload.bottles[0].quantity).toBe(2);
    expect(res.body.payload.bottles[1].isApero).toBe(true);
    expect(res.body.payload.bottles[1].location).toBe('Étagère 1');
    // Two distinct categories derived from rows
    expect(res.body.payload.categories).toHaveLength(2);
  });

  it('should reject a CSV missing required columns', async () => {
    const csv = 'name,foo\nHavana,bar';
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', Buffer.from(csv), 'bottles.csv');
    expect(res.status).toBe(400);
  });

  it('should parse a ZIP containing bottles.csv and categories.csv', async () => {
    const bottlesCsv = 'name,categoryName,categoryType,capacityMl,quantity\nHavana,Rhum,SPIRIT,700,1';
    const categoriesCsv = 'name,type,desiredStock,minimumPercent\nRhum,SPIRIT,3,25\nGin,SPIRIT,2,30';
    const zip = new AdmZip();
    zip.addFile('bottles.csv', Buffer.from(bottlesCsv));
    zip.addFile('categories.csv', Buffer.from(categoriesCsv));

    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', zip.toBuffer(), 'bottles.zip');

    expect(res.status).toBe(200);
    expect(res.body.payload.bottles).toHaveLength(1);
    // categories.csv overrides — Rhum's desiredStock from the explicit file (3), plus Gin
    expect(res.body.payload.categories).toHaveLength(2);
    const rhum = res.body.payload.categories.find((c: any) => c.name === 'Rhum');
    expect(rhum.desiredStock).toBe(3);
  });

  it('should reject a ZIP without bottles.csv or bottles.json', async () => {
    const zip = new AdmZip();
    zip.addFile('something_else.txt', Buffer.from('nope'));
    const res = await request.post('/api/bottles/import/preview')
      .set(authHeader())
      .attach('file', zip.toBuffer(), 'bottles.zip');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bottles/import/confirm', () => {
  it('should return 401 without auth', async () => {
    const res = await request.post('/api/bottles/import/confirm').send({});
    expect(res.status).toBe(401);
  });

  it('should return 400 for invalid payload version', async () => {
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload: { version: 99, bottles: [] } });
    expect(res.status).toBe(400);
  });

  it('should create bottles using an existing category', async () => {
    const cat = await seedCategory({ name: 'Rhum', type: 'SPIRIT' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Havana', categoryName: 'Rhum', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: 40, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });

    expect(res.status).toBe(201);
    expect(res.body.created.bottles).toBe(1);
    const inDb = await prisma.bottle.findMany();
    expect(inDb).toHaveLength(1);
    expect(inDb[0].categoryId).toBe(cat.id);
  });

  it('should create a new category and then the bottle', async () => {
    const payload = {
      version: 1,
      categories: [{ name: 'NewCat', type: 'SPIRIT', desiredStock: 2, minimumPercent: 20, nameTranslations: null }],
      bottles: [{
        name: 'NewBottle', categoryName: 'NewCat', capacityMl: 500, remainingPercent: 100,
        alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      }],
    };
    const resolutions = {
      categories: {
        newcat: {
          action: 'create',
          data: { name: 'NewCat', type: 'SPIRIT', desiredStock: 2, minimumPercent: 20 },
        },
      },
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions });

    expect(res.status).toBe(201);
    const cats = await prisma.category.findMany({ where: { name: 'NewCat' } });
    expect(cats).toHaveLength(1);
    expect(cats[0].desiredStock).toBe(2);
    const bottles = await prisma.bottle.findMany();
    expect(bottles).toHaveLength(1);
    expect(bottles[0].categoryId).toBe(cats[0].id);
  });

  it('should multiply bottle creation by quantity field', async () => {
    await seedCategory({ name: 'Beer' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Heineken', categoryName: 'Beer', capacityMl: 330, remainingPercent: 100,
        alcoholPercentage: 5, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 6,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });

    expect(res.body.created.bottles).toBe(6);
    const bottles = await prisma.bottle.findMany();
    expect(bottles).toHaveLength(6);
  });

  it('should cap quantity at 50', async () => {
    await seedCategory({ name: 'Beer' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Stout', categoryName: 'Beer', capacityMl: 330, remainingPercent: 100,
        alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 999,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });
    expect(res.body.created.bottles).toBe(50);
  });

  it('should honor skip action on a bottle resolution', async () => {
    await seedCategory({ name: 'Rhum' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [
        { name: 'Keep', categoryName: 'Rhum', capacityMl: 700, remainingPercent: 100,
          alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
          isApero: false, isDigestif: false, quantity: 1 },
        { name: 'Drop', categoryName: 'Rhum', capacityMl: 700, remainingPercent: 100,
          alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
          isApero: false, isDigestif: false, quantity: 1 },
      ],
    };
    const resolutions = { bottles: { '1': { action: 'skip' } } };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions });

    expect(res.body.created.bottles).toBe(1);
    const bottles = await prisma.bottle.findMany();
    expect(bottles.map((b) => b.name)).toEqual(['Keep']);
  });

  it('should let resolution override missing categoryName', async () => {
    const cat = await seedCategory({ name: 'Rhum' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Orphan', categoryName: '', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      }],
    };
    const resolutions = { bottles: { '0': { action: 'import', categoryName: 'Rhum' } } };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions });

    expect(res.body.created.bottles).toBe(1);
    const bottles = await prisma.bottle.findMany();
    expect(bottles[0].categoryId).toBe(cat.id);
    expect(res.body.skippedNoCategory).toBe(0);
  });

  it('should skip a bottle when no category can be resolved', async () => {
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Orphan', categoryName: '', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: null, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });

    expect(res.body.created.bottles).toBe(0);
    expect(res.body.skippedNoCategory).toBe(1);
  });

  it('should count duplicates created when bottles match existing ones', async () => {
    const cat = await seedCategory({ name: 'Vodka' });
    await seedBottle({ name: 'Absolut', categoryId: cat.id, capacityMl: 700 });

    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Absolut', categoryName: 'Vodka', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: 40, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 2,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });

    expect(res.body.created.bottles).toBe(2);
    expect(res.body.duplicatesCreated).toBe(2);
  });

  it('should add imported isApero bottles to the aperitifs menu', async () => {
    await seedCategory({ name: 'Apero' });
    const payload = {
      version: 1,
      categories: [],
      bottles: [{
        name: 'Campari', categoryName: 'Apero', capacityMl: 700, remainingPercent: 100,
        alcoholPercentage: 25, purchasePrice: null, location: null, openedAt: null,
        isApero: true, isDigestif: false, quantity: 1,
      }],
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions: {} });
    expect(res.status).toBe(201);

    const aperoMenu = await prisma.menu.findUnique({ where: { slug: 'aperitifs' } });
    const mb = await prisma.menuBottle.findFirst({ where: { menuId: aperoMenu!.id } });
    expect(mb).not.toBeNull();
  });

  it('should auto-create a missing CategoryType when creating a category', async () => {
    const payload = {
      version: 1,
      categories: [{ name: 'CustomCat', type: 'BITTER', desiredStock: 1, minimumPercent: 30, nameTranslations: null }],
      bottles: [{
        name: 'Angostura', categoryName: 'CustomCat', capacityMl: 200, remainingPercent: 100,
        alcoholPercentage: 44, purchasePrice: null, location: null, openedAt: null,
        isApero: false, isDigestif: false, quantity: 1,
      }],
    };
    const resolutions = {
      categories: {
        customcat: { action: 'create', data: { name: 'CustomCat', type: 'BITTER', desiredStock: 1, minimumPercent: 30 } },
      },
    };
    const res = await request.post('/api/bottles/import/confirm')
      .set(authHeader())
      .send({ payload, resolutions });

    expect(res.status).toBe(201);
    const types = await prisma.categoryType.findMany({ where: { name: 'BITTER' } });
    expect(types).toHaveLength(1);
  });
});
