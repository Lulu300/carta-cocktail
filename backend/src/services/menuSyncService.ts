import { Prisma, PrismaClient } from '../generated/prisma/client';
import { BadRequestError, NotFoundError } from '../errors';
import { nextPosition } from './positions';

/**
 * Bottle menus (task C-06).
 *
 * - A bottle is *available* for a bottle menu type when its flag for that type is set,
 *   empty or not: an empty bottle keeps its place and the public page hides it.
 * - The two system menus hold every available bottle except the ones the admin excluded.
 * - A personal menu of the same type is filled by hand, among the available bottles.
 *
 * Callers run the writes in a transaction: pass the transaction client as `db`.
 */
type Db = Prisma.TransactionClient | PrismaClient;

export const BOTTLE_MENU_FLAG = { APEROS: 'isApero', DIGESTIFS: 'isDigestif' } as const;
export type BottleMenuType = keyof typeof BOTTLE_MENU_FLAG;
const BOTTLE_MENU_TYPES = Object.keys(BOTTLE_MENU_FLAG) as BottleMenuType[];

// Created by the seed; A-02 forbids changing their slug and type, so the slug identifies them.
export const SYSTEM_MENU_SLUGS: Record<BottleMenuType, string> = { APEROS: 'aperitifs', DIGESTIFS: 'digestifs' };

interface BottleFlags {
  id: number;
  isApero: boolean;
  isDigestif: boolean;
}

const BOTTLE_FLAGS_SELECT = { id: true, isApero: true, isDigestif: true } satisfies Prisma.BottleSelect;

interface MenuIdentity {
  id: number;
  slug: string;
  type: string;
}

export function isSystemMenu(menu: { slug: string }): boolean {
  return Object.values(SYSTEM_MENU_SLUGS).includes(menu.slug);
}

export function isBottleMenuType(type: string): type is BottleMenuType {
  return (BOTTLE_MENU_TYPES as string[]).includes(type);
}

/** The only rule of availability: the flag of the type, whatever the remaining level. */
export function isAvailableFor(bottle: Omit<BottleFlags, 'id'>, type: BottleMenuType): boolean {
  return bottle[BOTTLE_MENU_FLAG[type]];
}

/** Whether a bottle belongs to the system menu of `type`, whose exclusions are `excludedIds`. */
export function isEligible(bottle: BottleFlags, type: BottleMenuType, excludedIds: ReadonlySet<number>): boolean {
  return isAvailableFor(bottle, type) && !excludedIds.has(bottle.id);
}

/** Refuses a menu that holds no bottles, or a bottle that is not available for the menu's type. */
export async function assertBottlesAllowed(db: Db, menu: { type: string }, bottleIds: number[]): Promise<void> {
  const uniqueIds = [...new Set(bottleIds)];
  // An empty list only clears the menu, which any menu allows
  if (uniqueIds.length === 0) return;
  const { type } = menu;
  if (!isBottleMenuType(type)) throw new BadRequestError('errors.bottleNotAllowedInMenu');

  const bottles = await db.bottle.findMany({ where: { id: { in: uniqueIds } }, select: BOTTLE_FLAGS_SELECT });
  const allAvailable = bottles.length === uniqueIds.length && bottles.every((bottle) => isAvailableFor(bottle, type));
  if (!allAvailable) throw new BadRequestError('errors.bottleNotAllowedInMenu');
}

async function findMenu(db: Db, menuId: number): Promise<MenuIdentity> {
  const menu = await db.menu.findUnique({ where: { id: menuId }, select: { id: true, slug: true, type: true } });
  if (!menu) throw new NotFoundError();
  return menu;
}

/** Adds the bottle at the end of the menu, visible and outside any section. */
async function appendBottle(db: Db, menuId: number, bottleId: number): Promise<void> {
  await db.menuBottle.create({ data: { menuId, bottleId, position: await nextPosition(db, 'menuBottle', menuId) } });
}

/** The type of a system menu, or an error naming why the menu cannot be synchronized. */
function systemMenuType(menu: MenuIdentity): BottleMenuType {
  if (!isBottleMenuType(menu.type)) throw new BadRequestError('errors.cannotSyncCocktailMenu');
  if (!isSystemMenu(menu)) throw new BadRequestError('errors.cannotSyncPersonalMenu');
  return menu.type;
}

/**
 * Brings a system menu in line with the bottles: eligible bottles missing from it are
 * added at the end, in category and name order; the others are removed.
 */
export async function syncMenu(db: Db, menuId: number): Promise<{ added: number; removed: number }> {
  const type = systemMenuType(await findMenu(db, menuId));

  const exclusions = await db.menuBottleExclusion.findMany({ where: { menuId }, select: { bottleId: true } });
  const excludedIds = new Set(exclusions.map((exclusion) => exclusion.bottleId));
  const bottles = await db.bottle.findMany({
    select: BOTTLE_FLAGS_SELECT,
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });
  const eligibleIds = bottles.filter((bottle) => isEligible(bottle, type, excludedIds)).map((bottle) => bottle.id);
  const eligibleSet = new Set(eligibleIds);

  const entries = await db.menuBottle.findMany({ where: { menuId }, select: { id: true, bottleId: true } });
  const presentIds = new Set(entries.map((entry) => entry.bottleId));
  const toAdd = eligibleIds.filter((bottleId) => !presentIds.has(bottleId));
  const toRemove = entries.filter((entry) => !eligibleSet.has(entry.bottleId));

  if (toAdd.length > 0) {
    const firstPosition = await nextPosition(db, 'menuBottle', menuId);
    await db.menuBottle.createMany({
      data: toAdd.map((bottleId, index) => ({ menuId, bottleId, position: firstPosition + index })),
    });
  }
  if (toRemove.length > 0) {
    await db.menuBottle.deleteMany({ where: { id: { in: toRemove.map((entry) => entry.id) } } });
  }
  return { added: toAdd.length, removed: toRemove.length };
}

async function addToSystemMenu(db: Db, bottle: BottleFlags, type: BottleMenuType): Promise<void> {
  const menu = await db.menu.findUnique({
    where: { slug: SYSTEM_MENU_SLUGS[type] },
    select: {
      id: true,
      bottles: { where: { bottleId: bottle.id }, select: { id: true } },
      bottleExclusions: { where: { bottleId: bottle.id }, select: { bottleId: true } },
    },
  });
  if (!menu || menu.bottles.length > 0) return;

  const excludedIds = new Set(menu.bottleExclusions.map((exclusion) => exclusion.bottleId));
  if (isEligible(bottle, type, excludedIds)) await appendBottle(db, menu.id, bottle.id);
}

/**
 * Applies the flags of one bottle: available, it joins the system menu of the type
 * (never a personal menu); unavailable, it leaves every menu of the type.
 * Exclusions are kept: a bottle unchecked then checked again stays excluded.
 */
export async function syncBottle(db: Db, bottleId: number): Promise<void> {
  const bottle = await db.bottle.findUniqueOrThrow({ where: { id: bottleId }, select: BOTTLE_FLAGS_SELECT });
  for (const type of BOTTLE_MENU_TYPES) {
    if (isAvailableFor(bottle, type)) {
      await addToSystemMenu(db, bottle, type);
    } else {
      await db.menuBottle.deleteMany({ where: { bottleId, menu: { type } } });
    }
  }
}

async function removeUnavailableBottles(db: Db): Promise<void> {
  const entries = await db.menuBottle.findMany({
    where: { menu: { type: { in: BOTTLE_MENU_TYPES } } },
    select: { id: true, menu: { select: { type: true } }, bottle: { select: BOTTLE_FLAGS_SELECT } },
  });
  const unavailableIds = entries
    .filter(({ menu, bottle }) => isBottleMenuType(menu.type) && !isAvailableFor(bottle, menu.type))
    .map((entry) => entry.id);
  if (unavailableIds.length > 0) await db.menuBottle.deleteMany({ where: { id: { in: unavailableIds } } });
}

/** Synchronizes every bottle menu at once, e.g. after an import of many bottles. */
export async function syncAllBottleMenus(db: Db): Promise<void> {
  for (const slug of Object.values(SYSTEM_MENU_SLUGS)) {
    const menu = await db.menu.findUnique({ where: { slug }, select: { id: true } });
    if (menu) await syncMenu(db, menu.id);
  }
  // The system menus are already clean: this removes unchecked bottles from personal menus
  await removeUnavailableBottles(db);
}

/**
 * Removes bottles from a system menu and records why, so the sync never adds them back.
 * A bottle that is not in the menu is ignored. Run it in a transaction: all or nothing.
 */
export async function excludeBottles(db: Db, menuId: number, bottleIds: number[]): Promise<void> {
  const menu = await findMenu(db, menuId);
  if (!isSystemMenu(menu)) throw new BadRequestError('errors.exclusionsSystemMenuOnly');

  const entries = await db.menuBottle.findMany({
    where: { menuId, bottleId: { in: bottleIds } },
    select: { id: true, bottleId: true },
  });
  if (entries.length === 0) return;

  await db.menuBottle.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
  await db.menuBottleExclusion.createMany({ data: entries.map(({ bottleId }) => ({ menuId, bottleId })) });
}

/**
 * Lifts an exclusion (404 when there is none). A bottle still available for the menu's
 * type comes back at the end of the menu, visible and outside any section.
 */
export async function restoreBottle(db: Db, menuId: number, bottleId: number): Promise<void> {
  const exclusion = await db.menuBottleExclusion.delete({
    where: { menuId_bottleId: { menuId, bottleId } },
    select: { menu: { select: { type: true } }, bottle: { select: BOTTLE_FLAGS_SELECT } },
  });
  const { type } = exclusion.menu;
  if (isBottleMenuType(type) && isAvailableFor(exclusion.bottle, type)) {
    await appendBottle(db, menuId, bottleId);
  }
}
