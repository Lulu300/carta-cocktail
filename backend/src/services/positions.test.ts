import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma,
  seedBottle, seedMenu, seedMenuSection, seedCocktail, addBottleToMenu, addCocktailToMenu,
} from '../test/helpers';
import { BadRequestError, NotFoundError } from '../errors';
import { assertSectionInMenu, nextPosition, reorder } from './positions';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

async function sectionPositions(menuId: number): Promise<Record<number, number>> {
  const sections = await prisma.menuSection.findMany({ where: { menuId } });
  return Object.fromEntries(sections.map((section) => [section.id, section.position]));
}

/** A menu with three sections at positions 0, 1, 2. */
async function seedMenuWithSections() {
  const menu = await seedMenu();
  const sections = [
    await seedMenuSection(menu.id, { name: 'A', position: 0 }),
    await seedMenuSection(menu.id, { name: 'B', position: 1 }),
    await seedMenuSection(menu.id, { name: 'C', position: 2 }),
  ];
  return { menu, ids: sections.map((section) => section.id) };
}

describe('nextPosition', () => {
  it('returns 0 for an empty menu', async () => {
    const menu = await seedMenu();
    expect(await nextPosition(prisma, 'menuSection', menu.id)).toBe(0);
    expect(await nextPosition(prisma, 'menuBottle', menu.id)).toBe(0);
    expect(await nextPosition(prisma, 'menuCocktail', menu.id)).toBe(0);
  });

  it('returns the highest position of the menu plus one, whatever the gaps', async () => {
    const menu = await seedMenu({ type: 'APEROS' });
    const other = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });
    await addBottleToMenu(menu.id, bottle.id, { position: 4 });
    await addBottleToMenu(other.id, bottle.id, { position: 9 });

    expect(await nextPosition(prisma, 'menuBottle', menu.id)).toBe(5);
  });

  it('counts the cocktails of a menu', async () => {
    const menu = await seedMenu();
    const cocktail = await seedCocktail();
    await addCocktailToMenu(menu.id, cocktail.id, { position: 2 });

    expect(await nextPosition(prisma, 'menuCocktail', menu.id)).toBe(3);
  });
});

describe('reorder', () => {
  it('gives the positions 0..n-1 in the order of the list', async () => {
    const { menu, ids: [a, b, c] } = await seedMenuWithSections();

    await prisma.$transaction((tx) => reorder(tx, 'menuSection', menu.id, [c, a, b]));

    expect(await sectionPositions(menu.id)).toEqual({ [c]: 0, [a]: 1, [b]: 2 });
  });

  it('reorders the cocktails of a menu', async () => {
    const menu = await seedMenu();
    const first = await addCocktailToMenu(menu.id, (await seedCocktail({ name: 'First' })).id, { position: 0 });
    const second = await addCocktailToMenu(menu.id, (await seedCocktail({ name: 'Second' })).id, { position: 1 });

    await prisma.$transaction((tx) => reorder(tx, 'menuCocktail', menu.id, [second.id, first.id]));

    const entries = await prisma.menuCocktail.findMany({ where: { menuId: menu.id }, orderBy: { position: 'asc' } });
    expect(entries.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it.each([
    ['a duplicate id', 'errors.reorderDuplicateIds', (ids: number[]) => [ids[0], ids[0], ids[1]]],
    ['an incomplete list', 'errors.reorderIncomplete', (ids: number[]) => [ids[1], ids[0]]],
  ])('refuses %s and writes nothing', async (_case, key, listOf) => {
    const { menu, ids } = await seedMenuWithSections();
    const before = await sectionPositions(menu.id);

    const attempt = prisma.$transaction((tx) => reorder(tx, 'menuSection', menu.id, listOf(ids)));

    await expect(attempt).rejects.toThrow(BadRequestError);
    await expect(attempt).rejects.toThrow(key);
    expect(await sectionPositions(menu.id)).toEqual(before);
  });

  it('refuses an id of another menu and writes nothing in either menu', async () => {
    const { menu, ids: [a, b] } = await seedMenuWithSections();
    const other = await seedMenu();
    const foreign = await seedMenuSection(other.id, { position: 7 });
    const before = await sectionPositions(menu.id);

    const attempt = prisma.$transaction((tx) => reorder(tx, 'menuSection', menu.id, [b, a, foreign.id]));

    await expect(attempt).rejects.toThrow('errors.reorderForeignIds');
    expect(await sectionPositions(menu.id)).toEqual(before);
    expect(await sectionPositions(other.id)).toEqual({ [foreign.id]: 7 });
  });

  it('refuses an unknown menu with a 404', async () => {
    const attempt = prisma.$transaction((tx) => reorder(tx, 'menuSection', 9999, []));
    await expect(attempt).rejects.toThrow(NotFoundError);
  });

  it('accepts an empty list for a menu without items', async () => {
    const menu = await seedMenu();
    await expect(prisma.$transaction((tx) => reorder(tx, 'menuSection', menu.id, []))).resolves.toBeUndefined();
  });
});

describe('assertSectionInMenu', () => {
  it('accepts a section of the menu, no section, and an unchanged section', async () => {
    const menu = await seedMenu();
    const section = await seedMenuSection(menu.id);

    await expect(assertSectionInMenu(prisma, section.id, menu.id)).resolves.toBeUndefined();
    await expect(assertSectionInMenu(prisma, null, menu.id)).resolves.toBeUndefined();
    await expect(assertSectionInMenu(prisma, undefined, menu.id)).resolves.toBeUndefined();
  });

  it('refuses a section of another menu and an unknown section', async () => {
    const menu = await seedMenu();
    const other = await seedMenu();
    const foreign = await seedMenuSection(other.id);

    await expect(assertSectionInMenu(prisma, foreign.id, menu.id)).rejects.toThrow('errors.sectionNotInMenu');
    await expect(assertSectionInMenu(prisma, 9999, menu.id)).rejects.toThrow('errors.sectionNotInMenu');
  });
});
