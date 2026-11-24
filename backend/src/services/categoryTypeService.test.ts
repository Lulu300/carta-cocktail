import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma,
} from '../test/helpers';
import { ensureCategoryType, newCategoryTypeName } from './categoryTypeService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

async function typeNames(): Promise<string[]> {
  const types = await prisma.categoryType.findMany({ orderBy: { name: 'asc' } });
  return types.map((type) => type.name);
}

describe('newCategoryTypeName', () => {
  it.each([
    ['JUICE', 'JUICE'],
    ['  JUICE  ', 'JUICE'],
    ['FRUIT  JUICE', 'FRUIT JUICE'],
    [' FRUIT \t\n JUICE ', 'FRUIT JUICE'],
    ['FRUIT JUICE', 'FRUIT JUICE'],
    ['   ', ''],
  ])('should store %j as %j', (name, expected) => {
    expect(newCategoryTypeName(name)).toBe(expected);
  });
});

describe('ensureCategoryType', () => {
  it('should keep an existing type with inner spaces as it is', async () => {
    await prisma.categoryType.create({ data: { name: 'X  Y', color: 'red' } });

    expect(await ensureCategoryType(prisma, 'X  Y')).toBe('X  Y');
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP', 'X  Y']);
  });

  it('should keep an existing type with surrounding spaces as it is', async () => {
    await prisma.categoryType.create({ data: { name: ' SPIRIT ', color: 'gray' } });

    expect(await ensureCategoryType(prisma, ' SPIRIT ')).toBe(' SPIRIT ');
    expect(await prisma.categoryType.count()).toBe(4);
  });

  it('should create a new type with its inner spaces collapsed, in gray', async () => {
    expect(await ensureCategoryType(prisma, ' FRUIT   JUICE ')).toBe('FRUIT JUICE');
    expect(await prisma.categoryType.findUnique({ where: { name: 'FRUIT JUICE' } })).toEqual(
      { name: 'FRUIT JUICE', nameTranslations: null, color: 'gray' },
    );
    expect(await typeNames()).toEqual(['FRUIT JUICE', 'SOFT', 'SPIRIT', 'SYRUP']);
  });

  it('should use the existing tidy type rather than create a spaced copy of it', async () => {
    await prisma.categoryType.create({ data: { name: 'X Y', color: 'red' } });

    expect(await ensureCategoryType(prisma, 'X  Y')).toBe('X Y');
    expect(await prisma.categoryType.findUnique({ where: { name: 'X Y' } })).toMatchObject({ color: 'red' });
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP', 'X Y']);
  });

  it('should refuse a blank name that names no type, and create nothing', async () => {
    await expect(ensureCategoryType(prisma, '   ')).rejects.toMatchObject({
      status: 400, i18nKey: 'errors.validationError', details: [{ path: 'body.type', code: 'too_small' }],
    });
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP']);
  });
});
