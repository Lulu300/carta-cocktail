import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma,
  seedBottle, seedMenu, seedMenuSection, addBottleToMenu, excludeBottleFromMenu, findSystemMenu,
} from '../test/helpers';
import {
  assertBottlesAllowed, BottleMenuType, excludeBottles, isAvailableFor, isEligible, isSystemMenu,
  restoreBottle, syncAllBottleMenus, syncBottle, syncMenu,
} from './menuSyncService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

/** Thrown inside a transaction to roll it back after the code under test ran. */
class Rollback extends Error {}

async function bottleIdsOf(menuId: number): Promise<number[]> {
  const entries = await prisma.menuBottle.findMany({ where: { menuId }, orderBy: { position: 'asc' } });
  return entries.map((entry) => entry.bottleId);
}

async function excludedIdsOf(menuId: number): Promise<number[]> {
  const exclusions = await prisma.menuBottleExclusion.findMany({ where: { menuId }, orderBy: { bottleId: 'asc' } });
  return exclusions.map((exclusion) => exclusion.bottleId);
}

describe('isAvailableFor', () => {
  it.each<[boolean, boolean, BottleMenuType, boolean]>([
    [true, false, 'APEROS', true],
    [false, false, 'APEROS', false],
    [false, true, 'APEROS', false],
    [false, true, 'DIGESTIFS', true],
    [true, false, 'DIGESTIFS', false],
    [true, true, 'DIGESTIFS', true],
  ])('isApero=%s isDigestif=%s for %s → %s, full or empty', (isApero, isDigestif, type, expected) => {
    // The remaining level is not part of the bottle the rule reads: empty or full, same answer
    for (const remainingPercent of [0, 100]) {
      const bottle = { id: 1, isApero, isDigestif, remainingPercent };
      expect(isAvailableFor(bottle, type)).toBe(expected);
    }
  });
});

describe('isEligible', () => {
  const bottle = { id: 7, isApero: true, isDigestif: false };

  it('accepts an available bottle that is not excluded', () => {
    expect(isEligible(bottle, 'APEROS', new Set([8]))).toBe(true);
  });

  it('refuses an excluded bottle', () => {
    expect(isEligible(bottle, 'APEROS', new Set([7]))).toBe(false);
  });

  it('refuses a bottle that is not available for the type', () => {
    expect(isEligible(bottle, 'DIGESTIFS', new Set())).toBe(false);
  });
});

describe('isSystemMenu', () => {
  it.each([
    ['aperitifs', true],
    ['digestifs', true],
    ['summer-aperitifs', false],
  ])('%s → %s', (slug, expected) => {
    expect(isSystemMenu({ slug })).toBe(expected);
  });
});

describe('assertBottlesAllowed', () => {
  it('accepts bottles checked for the menu type, empty ones included', async () => {
    const full = await seedBottle({ isApero: true });
    const empty = await seedBottle({ isApero: true, remainingPercent: 0 });
    await expect(assertBottlesAllowed(prisma, { type: 'APEROS' }, [full.id, empty.id])).resolves.toBeUndefined();
  });

  it('refuses a bottle not checked for the menu type', async () => {
    const digestif = await seedBottle({ isDigestif: true });
    await expect(assertBottlesAllowed(prisma, { type: 'APEROS' }, [digestif.id]))
      .rejects.toMatchObject({ status: 400, i18nKey: 'errors.bottleNotAllowedInMenu' });
  });

  it('refuses an unknown bottle', async () => {
    await expect(assertBottlesAllowed(prisma, { type: 'APEROS' }, [9999])).rejects.toMatchObject({ status: 400 });
  });

  it('refuses any bottle in a cocktail menu, but lets it be emptied', async () => {
    const bottle = await seedBottle({ isApero: true });
    await expect(assertBottlesAllowed(prisma, { type: 'COCKTAILS' }, [bottle.id]))
      .rejects.toMatchObject({ i18nKey: 'errors.bottleNotAllowedInMenu' });
    await expect(assertBottlesAllowed(prisma, { type: 'COCKTAILS' }, [])).resolves.toBeUndefined();
  });
});

describe('syncMenu', () => {
  it('adds the eligible bottles at the end, removes the others, skips the excluded ones', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const kept = await seedBottle({ name: 'Aperol', isApero: true });
    const unchecked = await seedBottle({ name: 'Cognac', isDigestif: true });
    await addBottleToMenu(aperitifs.id, kept.id, { position: 4 });
    await addBottleToMenu(aperitifs.id, unchecked.id, { position: 5 });
    const empty = await seedBottle({ name: 'Campari', isApero: true, remainingPercent: 0 });
    const excluded = await seedBottle({ name: 'Lillet', isApero: true });
    await excludeBottleFromMenu(aperitifs.id, excluded.id);

    const result = await syncMenu(prisma, aperitifs.id);

    expect(result).toEqual({ added: 1, removed: 1 });
    const entries = await prisma.menuBottle.findMany({ where: { menuId: aperitifs.id }, orderBy: { position: 'asc' } });
    expect(entries.map((entry) => [entry.bottleId, entry.position])).toEqual([[kept.id, 4], [empty.id, 6]]);
  });

  it('is idempotent', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    await seedBottle({ isApero: true });
    await syncMenu(prisma, aperitifs.id);
    expect(await syncMenu(prisma, aperitifs.id)).toEqual({ added: 0, removed: 0 });
  });

  it('refuses a personal menu, a cocktail menu and an unknown menu', async () => {
    const personal = await seedMenu({ type: 'APEROS' });
    const cocktails = await seedMenu();
    await expect(syncMenu(prisma, personal.id)).rejects.toMatchObject({ i18nKey: 'errors.cannotSyncPersonalMenu' });
    await expect(syncMenu(prisma, cocktails.id)).rejects.toMatchObject({ i18nKey: 'errors.cannotSyncCocktailMenu' });
    await expect(syncMenu(prisma, 9999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('syncBottle', () => {
  it('adds a checked bottle to the system menu of its type only, never to a personal menu', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const digestifs = await findSystemMenu('digestifs');
    const personal = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: true });

    await syncBottle(prisma, bottle.id);

    expect(await bottleIdsOf(aperitifs.id)).toEqual([bottle.id]);
    expect(await bottleIdsOf(digestifs.id)).toEqual([]);
    expect(await bottleIdsOf(personal.id)).toEqual([]);
  });

  it('appends after the last position and leaves a bottle already there in place', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const first = await seedBottle({ isApero: true });
    await addBottleToMenu(aperitifs.id, first.id, { position: 3, isHidden: true });
    const second = await seedBottle({ isApero: true });

    await syncBottle(prisma, first.id);
    await syncBottle(prisma, second.id);

    const entries = await prisma.menuBottle.findMany({ where: { menuId: aperitifs.id }, orderBy: { position: 'asc' } });
    expect(entries.map((entry) => [entry.bottleId, entry.position, entry.isHidden]))
      .toEqual([[first.id, 3, true], [second.id, 4, false]]);
  });

  it('removes an unchecked bottle from the system menu and the personal menus of the type', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const digestifs = await findSystemMenu('digestifs');
    const personal = await seedMenu({ type: 'APEROS' });
    const bottle = await seedBottle({ isApero: false, isDigestif: true });
    await addBottleToMenu(aperitifs.id, bottle.id);
    await addBottleToMenu(personal.id, bottle.id);
    await addBottleToMenu(digestifs.id, bottle.id);

    await syncBottle(prisma, bottle.id);

    expect(await bottleIdsOf(aperitifs.id)).toEqual([]);
    expect(await bottleIdsOf(personal.id)).toEqual([]);
    expect(await bottleIdsOf(digestifs.id)).toEqual([bottle.id]);
  });

  it('keeps an excluded bottle out, even after being unchecked then checked again', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: true });
    await excludeBottleFromMenu(aperitifs.id, bottle.id);

    await syncBottle(prisma, bottle.id);
    await prisma.bottle.update({ where: { id: bottle.id }, data: { isApero: false } });
    await syncBottle(prisma, bottle.id);
    await prisma.bottle.update({ where: { id: bottle.id }, data: { isApero: true } });
    await syncBottle(prisma, bottle.id);

    expect(await bottleIdsOf(aperitifs.id)).toEqual([]);
    expect(await excludedIdsOf(aperitifs.id)).toEqual([bottle.id]);
  });

  it('writes nothing when the surrounding transaction fails', async () => {
    const bottle = await seedBottle({ isApero: true });

    await expect(prisma.$transaction(async (tx) => {
      await syncBottle(tx, bottle.id);
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);

    expect(await prisma.menuBottle.count()).toBe(0);
  });
});

describe('syncAllBottleMenus', () => {
  it('fills both system menus and removes unchecked bottles from personal menus', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const digestifs = await findSystemMenu('digestifs');
    const personal = await seedMenu({ type: 'DIGESTIFS' });
    const apero = await seedBottle({ isApero: true });
    const digestif = await seedBottle({ isDigestif: true });
    const unchecked = await seedBottle();
    await addBottleToMenu(personal.id, digestif.id);
    await addBottleToMenu(personal.id, unchecked.id, { position: 1 });

    await syncAllBottleMenus(prisma);

    expect(await bottleIdsOf(aperitifs.id)).toEqual([apero.id]);
    expect(await bottleIdsOf(digestifs.id)).toEqual([digestif.id]);
    expect(await bottleIdsOf(personal.id)).toEqual([digestif.id]);
  });

  it('skips a missing system menu', async () => {
    await prisma.menu.delete({ where: { slug: 'digestifs' } });
    const apero = await seedBottle({ isApero: true });

    await syncAllBottleMenus(prisma);

    expect(await bottleIdsOf((await findSystemMenu('aperitifs')).id)).toEqual([apero.id]);
  });
});

describe('excludeBottles and restoreBottle', () => {
  it('keeps an excluded bottle out of the sync, then restores it at the end', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: true });
    const other = await seedBottle({ isApero: true });
    const section = await seedMenuSection(aperitifs.id);
    await addBottleToMenu(aperitifs.id, bottle.id, { position: 0, menuSectionId: section.id });
    await addBottleToMenu(aperitifs.id, other.id, { position: 1 });

    await excludeBottles(prisma, aperitifs.id, [bottle.id]);
    await syncMenu(prisma, aperitifs.id);
    expect(await bottleIdsOf(aperitifs.id)).toEqual([other.id]);

    await restoreBottle(prisma, aperitifs.id, bottle.id);
    const restored = await prisma.menuBottle.findFirstOrThrow({ where: { menuId: aperitifs.id, bottleId: bottle.id } });
    expect(restored).toMatchObject({ position: 2, menuSectionId: null, isHidden: false });
    expect(await excludedIdsOf(aperitifs.id)).toEqual([]);
  });

  it('ignores a bottle that is not in the menu', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const absent = await seedBottle({ isApero: true });

    await excludeBottles(prisma, aperitifs.id, [absent.id]);

    expect(await excludedIdsOf(aperitifs.id)).toEqual([]);
  });

  it('refuses a personal menu', async () => {
    const personal = await seedMenu({ type: 'APEROS' });
    await expect(excludeBottles(prisma, personal.id, [1]))
      .rejects.toMatchObject({ status: 400, i18nKey: 'errors.exclusionsSystemMenuOnly' });
  });

  it('excludes nothing of the batch when the surrounding transaction fails', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottles = [await seedBottle({ isApero: true }), await seedBottle({ isApero: true }), await seedBottle({ isApero: true })];
    for (const [position, bottle] of bottles.entries()) await addBottleToMenu(aperitifs.id, bottle.id, { position });

    await expect(prisma.$transaction(async (tx) => {
      await excludeBottles(tx, aperitifs.id, bottles.map((bottle) => bottle.id));
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);

    expect(await excludedIdsOf(aperitifs.id)).toEqual([]);
    expect(await bottleIdsOf(aperitifs.id)).toEqual(bottles.map((bottle) => bottle.id));
  });

  it('lifts the exclusion of a bottle unchecked since, without adding it back', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: false });
    await excludeBottleFromMenu(aperitifs.id, bottle.id);

    await restoreBottle(prisma, aperitifs.id, bottle.id);

    expect(await excludedIdsOf(aperitifs.id)).toEqual([]);
    expect(await bottleIdsOf(aperitifs.id)).toEqual([]);
  });

  it('fails with P2025, answered as a 404, for an unknown exclusion', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    await expect(restoreBottle(prisma, aperitifs.id, 9999)).rejects.toMatchObject({ code: 'P2025' });
  });
});
