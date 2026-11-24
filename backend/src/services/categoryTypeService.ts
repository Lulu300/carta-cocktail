import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient;

/** A category may name a type that does not exist yet: it is created, in gray. */
export async function ensureCategoryType(db: Db, name: string): Promise<void> {
  await db.categoryType.upsert({ where: { name }, update: {}, create: { name, color: 'gray' } });
}

/** Adds to each category its `CategoryType` row (color, translations), or null. */
export async function withCategoryType<C extends { type: string }>(categories: C[]) {
  const categoryTypes = await prisma.categoryType.findMany();
  const typeByName = new Map(categoryTypes.map((categoryType) => [categoryType.name, categoryType]));
  return categories.map((category) => ({ ...category, categoryType: typeByName.get(category.type) ?? null }));
}
