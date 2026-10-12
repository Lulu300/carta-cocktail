import { Prisma, PrismaClient } from '../generated/prisma/client';
import { BadRequestError, NotFoundError } from '../errors';

/**
 * Order of the items of a menu (task C-13): sections, bottles and cocktails each carry a
 * `position` within their menu. Callers run the writes in a transaction: pass the
 * transaction client as `db`, so a refused reorder writes nothing.
 */
type Db = Prisma.TransactionClient | PrismaClient;

export type PositionedModel = 'menuSection' | 'menuBottle' | 'menuCocktail';

/** The calls this file makes, which the three Prisma delegates share under different types. */
interface PositionedDelegate {
  aggregate(args: {
    where: { menuId: number };
    _max: { position: true };
  }): Prisma.PrismaPromise<{ _max: { position: number | null } }>;
  count(args: { where: { menuId: number; id?: { in: number[] } } }): Prisma.PrismaPromise<number>;
  update(args: { where: { id: number }; data: { position: number } }): Prisma.PrismaPromise<unknown>;
}

function delegateOf(db: Db, model: PositionedModel): PositionedDelegate {
  switch (model) {
    case 'menuSection':
      return db.menuSection;
    case 'menuBottle':
      return db.menuBottle;
    case 'menuCocktail':
      return db.menuCocktail;
  }
}

/** The position after the last item of the menu: 0 for an empty menu. */
export async function nextPosition(db: Db, model: PositionedModel, menuId: number): Promise<number> {
  const last = await delegateOf(db, model).aggregate({ where: { menuId }, _max: { position: true } });
  return (last._max.position ?? -1) + 1;
}

/**
 * Gives the items of a menu the positions 0..n-1 in the order of `ids`.
 * `ids` must list every item of the menu once, and nothing else: a partial list would
 * leave the other items at positions that collide with the new ones.
 */
export async function reorder(db: Db, model: PositionedModel, menuId: number, ids: number[]): Promise<void> {
  const menu = await db.menu.findUnique({ where: { id: menuId }, select: { id: true } });
  if (!menu) throw new NotFoundError();
  if (new Set(ids).size !== ids.length) throw new BadRequestError('errors.reorderDuplicateIds');

  const delegate = delegateOf(db, model);
  const itemCount = await delegate.count({ where: { menuId } });
  if (itemCount !== ids.length) throw new BadRequestError('errors.reorderIncomplete');
  const ownedCount = await delegate.count({ where: { menuId, id: { in: ids } } });
  if (ownedCount !== ids.length) throw new BadRequestError('errors.reorderForeignIds');

  for (const [index, id] of ids.entries()) {
    await delegate.update({ where: { id }, data: { position: index } });
  }
}

/** Refuses a section that is not one of the menu's. `null` (no section) and `undefined` (unchanged) pass. */
export async function assertSectionInMenu(db: Db, menuSectionId: number | null | undefined, menuId: number): Promise<void> {
  if (menuSectionId == null) return;
  const section = await db.menuSection.findUnique({ where: { id: menuSectionId }, select: { menuId: true } });
  if (section?.menuId !== menuId) throw new BadRequestError('errors.sectionNotInMenu');
}
