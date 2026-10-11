import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError } from '../errors';

/**
 * Deletion of the items that recipes reference (bottles, categories,
 * ingredients, units).
 *
 * The schema restricts these deletions: an item used by a recipe is refused
 * with a 409 that lists what it would break. `force` then deletes the recipe
 * lines that use it in the same transaction. The cascade stays in this code,
 * never implicit in the database.
 */

export interface ImpactedCocktail {
  id: number;
  name: string;
  /** Recipe lines of the cocktail that use the item: a forced deletion removes them. */
  removedLines: number;
}

export interface ImpactedBottle {
  id: number;
  name: string;
}

/** Sent as `details` of the 409, and as `impact` once a deletion is done. */
export interface DeletionImpact {
  cocktails: ImpactedCocktail[];
  bottles: ImpactedBottle[];
}

type Db = Prisma.TransactionClient;

/** `?force=true` asks to delete an item that is in use, with what uses it. */
export function isForceRequested(value: unknown): boolean {
  return value === 'true';
}

async function findImpactedCocktails(
  db: Db,
  lines: Prisma.CocktailIngredientWhereInput,
): Promise<ImpactedCocktail[]> {
  const rows = await db.cocktailIngredient.findMany({
    where: lines,
    select: { cocktail: { select: { id: true, name: true } } },
    orderBy: { cocktailId: 'asc' },
  });
  const byCocktail = new Map<number, ImpactedCocktail>();
  for (const { cocktail } of rows) {
    const impacted = byCocktail.get(cocktail.id) ?? { ...cocktail, removedLines: 0 };
    impacted.removedLines += 1;
    byCocktail.set(cocktail.id, impacted);
  }
  return [...byCocktail.values()];
}

function refuseUnlessForced(impact: DeletionImpact, force: boolean, conflictKey: string): void {
  const isInUse = impact.cocktails.length > 0 || impact.bottles.length > 0;
  if (isInUse && !force) throw new ConflictError(conflictKey, impact);
}

/** Removes everything that references the bottles, but not the bottles themselves. */
async function deleteBottleReferences(tx: Db, bottleIds: number[]): Promise<void> {
  const where = { bottleId: { in: bottleIds } };
  await tx.cocktailIngredient.deleteMany({ where });
  await tx.cocktailPreferredBottle.deleteMany({ where });
  await tx.menuBottle.deleteMany({ where });
}

export async function deleteBottle(id: number, force: boolean): Promise<DeletionImpact> {
  return prisma.$transaction(async (tx) => {
    // A bottle that is only a preferred bottle is not "in use": the preference goes with it.
    const impact = { cocktails: await findImpactedCocktails(tx, { bottleId: id }), bottles: [] };
    refuseUnlessForced(impact, force, 'errors.inUseByCocktails');
    await deleteBottleReferences(tx, [id]);
    await tx.bottle.delete({ where: { id } });
    return impact;
  });
}

export async function deleteIngredient(id: number, force: boolean): Promise<DeletionImpact> {
  return prisma.$transaction(async (tx) => {
    const impact = { cocktails: await findImpactedCocktails(tx, { ingredientId: id }), bottles: [] };
    refuseUnlessForced(impact, force, 'errors.inUseByCocktails');
    await tx.cocktailIngredient.deleteMany({ where: { ingredientId: id } });
    await tx.ingredient.delete({ where: { id } });
    return impact;
  });
}

export async function deleteCategory(id: number, force: boolean): Promise<DeletionImpact> {
  return prisma.$transaction(async (tx) => {
    const bottles = await tx.bottle.findMany({
      where: { categoryId: id },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const bottleIds = bottles.map((bottle) => bottle.id);
    const cocktails = await findImpactedCocktails(tx, {
      OR: [{ categoryId: id }, { bottleId: { in: bottleIds } }],
    });
    const impact = { cocktails, bottles };
    refuseUnlessForced(impact, force, bottles.length > 0 ? 'errors.categoryNotEmpty' : 'errors.inUseByCocktails');

    await deleteBottleReferences(tx, bottleIds);
    await tx.bottle.deleteMany({ where: { categoryId: id } });
    await tx.cocktailIngredient.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
    return impact;
  });
}

/**
 * Units cannot be force-deleted: a recipe line has no meaning without a unit,
 * so the admin first changes the unit of the lines that use it.
 */
export async function deleteUnit(id: number): Promise<void> {
  const impact = { cocktails: await findImpactedCocktails(prisma, { unitId: id }), bottles: [] };
  refuseUnlessForced(impact, false, 'errors.inUseByCocktails');
  await prisma.unit.delete({ where: { id } });
}
