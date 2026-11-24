import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  request, authHeader, prisma, seedCategory,
} from '../test/helpers';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

/** The fields of GET /api/category-types these tests read. */
interface CategoryTypeUsage {
  name: string;
  _count: { categories: number };
}

describe('GET /api/category-types', () => {
  it('should return 401 without auth', async () => {
    const res = await request.get('/api/category-types');
    expect(res.status).toBe(401);
  });

  it('should return all category types with usage counts', async () => {
    await seedCategory({ type: 'SPIRIT' });
    const res = await request.get('/api/category-types').set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const types: CategoryTypeUsage[] = res.body;
    const spirit = types.find((t) => t.name === 'SPIRIT');
    expect(spirit?._count.categories).toBe(1);
  });

  it('should return count of 0 for unused types', async () => {
    const res = await request.get('/api/category-types').set(authHeader());
    const types: CategoryTypeUsage[] = res.body;
    const soft = types.find((t) => t.name === 'SOFT');
    expect(soft?._count.categories).toBe(0);
  });

  it('should count the categories of each type', async () => {
    await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    await seedCategory({ name: 'Gin', type: 'SPIRIT' });
    await seedCategory({ name: 'Grenadine', type: 'SYRUP' });
    const res = await request.get('/api/category-types').set(authHeader());
    const counts = Object.fromEntries((res.body as CategoryTypeUsage[]).map((t) => [t.name, t._count.categories]));
    expect(counts).toEqual({ SOFT: 0, SPIRIT: 2, SYRUP: 1 });
  });
});

describe('POST /api/category-types', () => {
  it('should return 400 if name is missing', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('should answer a missing name in French', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).set('Accept-Language', 'fr').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Erreur de validation');
  });

  it('should return 409 if type already exists', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).set('Accept-Language', 'fr')
      .send({ name: 'spirit' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Cette entrée existe déjà' });
  });

  it('should create with uppercase name and default color', async () => {
    const res = await request.post('/api/category-types').set(authHeader()).send({ name: 'juice' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('JUICE');
    expect(res.body.color).toBe('gray');
  });

  it('should store nameTranslations', async () => {
    const res = await request.post('/api/category-types').set(authHeader())
      .send({ name: 'BITTERS', nameTranslations: { fr: 'Amers' }, color: 'red' });
    expect(res.status).toBe(201);
    expect(res.body.nameTranslations).toEqual({ fr: 'Amers' });
    expect(res.body.color).toBe('red');
  });
});

describe('PUT /api/category-types/:name', () => {
  it('should return 404 for non-existent type', async () => {
    const res = await request.put('/api/category-types/NONEXISTENT').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Resource not found' });
  });

  it('should update color', async () => {
    const res = await request.put('/api/category-types/SPIRIT').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(200);
    expect(res.body.color).toBe('red');
  });

  it('should update nameTranslations', async () => {
    const res = await request.put('/api/category-types/SPIRIT').set(authHeader())
      .send({ nameTranslations: { fr: 'Spiritueux' } });
    expect(res.status).toBe(200);
    expect(res.body.nameTranslations).toEqual({ fr: 'Spiritueux' });
  });
});

// Data older than v1.9.0 can hold a type whose name has spaces around it, next to the
// same name without them. The name in the path is the stored key: it is not trimmed.
describe('A category type whose name has surrounding spaces', () => {
  const SPACED = ' SPIRIT ';
  const SPACED_PATH = '/api/category-types/%20SPIRIT%20';

  beforeEach(async () => {
    await prisma.categoryType.update({
      where: { name: 'SPIRIT' },
      data: { nameTranslations: JSON.stringify({ fr: 'Spiritueux', en: 'Spirits' }) },
    });
    await prisma.categoryType.create({ data: { name: SPACED, color: 'gray' } });
  });

  async function findType(name: string) {
    return prisma.categoryType.findUniqueOrThrow({ where: { name } });
  }

  it('should be edited without touching the type without spaces', async () => {
    const res = await request.put(SPACED_PATH).set(authHeader())
      .send({ color: 'red', nameTranslations: { fr: 'Alcool' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: SPACED, color: 'red', nameTranslations: { fr: 'Alcool' } });
    expect(await findType(SPACED)).toMatchObject({ color: 'red', nameTranslations: JSON.stringify({ fr: 'Alcool' }) });
    expect(await findType('SPIRIT')).toMatchObject({
      color: 'blue',
      nameTranslations: JSON.stringify({ fr: 'Spiritueux', en: 'Spirits' }),
    });
  });

  it('should be deleted without touching the type without spaces or its categories', async () => {
    const rum = await seedCategory({ name: 'Rum', type: 'SPIRIT' });

    const res = await request.delete(SPACED_PATH).set(authHeader());

    expect(res.status).toBe(200);
    expect(await prisma.categoryType.findUnique({ where: { name: SPACED } })).toBeNull();
    expect(await findType('SPIRIT')).toMatchObject({ color: 'blue' });
    expect(await prisma.category.findUniqueOrThrow({ where: { id: rum.id } })).toMatchObject({ type: 'SPIRIT' });
  });

  it('should delete the unused type without spaces and keep the spaced one', async () => {
    const res = await request.delete('/api/category-types/SPIRIT').set(authHeader());

    expect(res.status).toBe(200);
    expect(await prisma.categoryType.findUnique({ where: { name: 'SPIRIT' } })).toBeNull();
    expect(await findType(SPACED)).toMatchObject({ color: 'gray' });
  });

  it('should refuse to delete it while its own categories use it, even if the type without spaces is unused', async () => {
    await seedCategory({ name: 'Rum', type: SPACED });

    const res = await request.delete(SPACED_PATH).set(authHeader());

    expect(res.status).toBe(409);
    expect(await findType(SPACED)).toMatchObject({ color: 'gray' });
    expect(await findType('SPIRIT')).toMatchObject({ color: 'blue' });
  });

  it('should answer 404 to an edit of the spaced name when only the name without spaces exists', async () => {
    await prisma.categoryType.delete({ where: { name: SPACED } });

    const res = await request.put(SPACED_PATH).set(authHeader()).send({ color: 'red' });

    expect(res.status).toBe(404);
    expect(await findType('SPIRIT')).toMatchObject({ color: 'blue' });
  });
});

// Data older than v1.9.0 can also hold a type with an empty name. A path segment cannot
// carry it: the type can be named in the query instead.
describe('A category type named in the query', () => {
  it('should edit the type with an empty name', async () => {
    await prisma.categoryType.create({ data: { name: '', color: 'gray' } });

    const res = await request.put('/api/category-types?name=').set(authHeader())
      .send({ color: 'red', nameTranslations: { fr: 'Autre' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: '', color: 'red', nameTranslations: { fr: 'Autre' } });
    expect(await prisma.categoryType.findUniqueOrThrow({ where: { name: 'SPIRIT' } })).toMatchObject({ color: 'blue' });
  });

  it('should delete the unused type with an empty name, and only it', async () => {
    await prisma.categoryType.create({ data: { name: '', color: 'gray' } });

    const res = await request.delete('/api/category-types?name=').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Type deleted successfully' });
    expect((await prisma.categoryType.findMany()).map((type) => type.name).sort()).toEqual(['SOFT', 'SPIRIT', 'SYRUP']);
  });

  it('should refuse to delete the type with an empty name while categories use it', async () => {
    await prisma.categoryType.create({ data: { name: '', color: 'gray' } });
    await seedCategory({ name: 'Rum', type: '' });

    const res = await request.delete('/api/category-types?name=').set(authHeader());

    expect(res.status).toBe(409);
    expect(await prisma.categoryType.findUnique({ where: { name: '' } })).not.toBeNull();
  });

  it('should keep the name as sent, without trimming it', async () => {
    await prisma.categoryType.create({ data: { name: ' SPIRIT ', color: 'gray' } });

    const res = await request.put('/api/category-types?name=%20SPIRIT%20').set(authHeader()).send({ color: 'red' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(' SPIRIT ');
    expect(await prisma.categoryType.findUniqueOrThrow({ where: { name: 'SPIRIT' } })).toMatchObject({ color: 'blue' });
  });

  // The browser resolves '/category-types/..' to '/': the frontend names these types in the query.
  it.each(['.', '..'])('should edit and then delete the type named %s, and only it', async (name) => {
    await prisma.categoryType.create({ data: { name, color: 'gray' } });

    const updated = await request.put(`/api/category-types?name=${name}`).set(authHeader()).send({ color: 'red' });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ name, color: 'red', nameTranslations: null });

    const deleted = await request.delete(`/api/category-types?name=${name}`).set(authHeader());
    expect(deleted.status).toBe(200);
    expect((await prisma.categoryType.findMany()).map((type) => type.name).sort()).toEqual(['SOFT', 'SPIRIT', 'SYRUP']);
  });

  it('should answer 404 for a name that does not exist', async () => {
    const res = await request.put('/api/category-types?name=').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(404);
  });

  it.each([
    ['without a name', ''],
    ['with the name twice', '?name=SOFT&name=SYRUP'],
  ])('should refuse a deletion %s and delete nothing', async (_label, query) => {
    const res = await request.delete(`/api/category-types${query}`).set(authHeader());

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('query.name');
    expect(await prisma.categoryType.count()).toBe(3);
  });

  it('should refuse an edit without a name', async () => {
    const res = await request.put('/api/category-types').set(authHeader()).send({ color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('query.name');
  });
});

describe('Renaming a category type', () => {
  // The API has no rename: the name is the key. The foreign key cascades a rename
  // made in the database to the categories of the type.
  it('should move its categories to the new name', async () => {
    const rum = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    const grenadine = await seedCategory({ name: 'Grenadine', type: 'SYRUP' });

    await prisma.categoryType.update({ where: { name: 'SPIRIT' }, data: { name: 'LIQUOR' } });

    expect(await prisma.category.findUniqueOrThrow({ where: { id: rum.id } })).toMatchObject({ type: 'LIQUOR' });
    expect(await prisma.category.findUniqueOrThrow({ where: { id: grenadine.id } })).toMatchObject({ type: 'SYRUP' });
  });
});

describe('DELETE /api/category-types/:name', () => {
  it('should return a translated 409 if type is in use', async () => {
    await seedCategory({ type: 'SPIRIT' });
    const res = await request.delete('/api/category-types/SPIRIT').set(authHeader()).set('Accept-Language', 'fr');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Impossible de supprimer : des catégories utilisent encore ce type' });
    expect(await prisma.categoryType.findUnique({ where: { name: 'SPIRIT' } })).not.toBeNull();
  });

  it('should be refused by the database too when the route check is bypassed', async () => {
    await seedCategory({ type: 'SPIRIT' });
    await expect(prisma.categoryType.delete({ where: { name: 'SPIRIT' } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('should delete unused type', async () => {
    const res = await request.delete('/api/category-types/SOFT').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Type deleted successfully' });
    // Verify it's gone
    const check = await prisma.categoryType.findUnique({ where: { name: 'SOFT' } });
    expect(check).toBeNull();
  });
});
