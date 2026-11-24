import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma,
} from '../test/helpers';
import { ensureCategoryType, newCategoryTypeName, requireNewCategoryTypeName } from './categoryTypeService';

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

  // HTML shows 'X\u200BY' exactly like 'XY'
  it.each([
    ['X\u200BY', 'XY'],
    ['X\u00ADY\u2060', 'XY'],
    ['\u200B X \u200B Y \u200E', 'X Y'],
    ['\u202ERUM\u202C', 'RUM'],
    ['\u200B\u00AD \uFEFF', ''],
  ])('should remove the invisible characters of %j: %j', (name, expected) => {
    expect(newCategoryTypeName(name)).toBe(expected);
  });

  // A byte order mark is white space for JS, but HTML draws nothing for it: not a space either
  it('should remove a byte order mark inside the name rather than make it a space', () => {
    expect(newCategoryTypeName('X\uFEFFY')).toBe('XY');
  });

  it.each([
    'CRÈME DE CASSIS', 'می\u200Cخواهم', '👩\u200D💻 GEEK',
  ])('should keep %j, whose characters are all drawn', (name) => {
    expect(newCategoryTypeName(name)).toBe(name);
  });
});

describe('requireNewCategoryTypeName', () => {
  it('should return the tidy name', () => {
    expect(requireNewCategoryTypeName(' X\u200BY ', ['body', 'name'])).toBe('XY');
  });

  it('should refuse a name of invisible characters with the 400 of the field at the path', () => {
    expect(() => requireNewCategoryTypeName('\u200B\u2060', ['body', 'name'])).toThrow(expect.objectContaining({
      status: 400, i18nKey: 'errors.validationError', details: [expect.objectContaining({ path: 'body.name', code: 'too_small' })],
    }));
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

  it('should keep an existing type with an invisible character as it is', async () => {
    await prisma.categoryType.create({ data: { name: 'X\u200BY', color: 'red' } });

    expect(await ensureCategoryType(prisma, 'X\u200BY')).toBe('X\u200BY');
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP', 'X\u200BY']);
  });

  it('should create a new type without its invisible characters', async () => {
    expect(await ensureCategoryType(prisma, 'FRUIT\u00AD JUICE\u200B')).toBe('FRUIT JUICE');
    expect(await typeNames()).toEqual(['FRUIT JUICE', 'SOFT', 'SPIRIT', 'SYRUP']);
  });

  it('should use the existing type that only lacks the invisible characters', async () => {
    await prisma.categoryType.create({ data: { name: 'XY', color: 'red' } });

    expect(await ensureCategoryType(prisma, 'X\u200BY')).toBe('XY');
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP', 'XY']);
  });

  it('should refuse a name of invisible characters that names no type, and create nothing', async () => {
    await expect(ensureCategoryType(prisma, '\u200B \u00AD')).rejects.toMatchObject({
      status: 400, details: [{ path: 'body.type', code: 'too_small' }],
    });
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP']);
  });

  it('should refuse a blank name that names no type, and create nothing', async () => {
    await expect(ensureCategoryType(prisma, '   ')).rejects.toMatchObject({
      status: 400, i18nKey: 'errors.validationError', details: [{ path: 'body.type', code: 'too_small' }],
    });
    expect(await typeNames()).toEqual(['SOFT', 'SPIRIT', 'SYRUP']);
  });
});
