import { Prisma } from '../generated/prisma/client';

type Db = Prisma.TransactionClient;

/**
 * A category may name a type that does not exist yet: it is created, in gray,
 * before the category, which the foreign key ties to an existing type.
 */
export async function ensureCategoryType(db: Db, name: string): Promise<void> {
  await db.categoryType.upsert({ where: { name }, update: {}, create: { name, color: 'gray' } });
}
