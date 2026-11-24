import { Prisma } from '../generated/prisma/client';
import { BadRequestError } from '../errors';

type Db = Prisma.TransactionClient;

/**
 * The name a new category type is stored under: no spaces around it, and every run of
 * whitespace inside it reduced to one space. HTML shows 'X  Y' exactly like 'X Y', so two
 * types that differ only there could not be told apart.
 */
export function newCategoryTypeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * A category may name a type that does not exist yet: it is created, in gray,
 * before the category, which the foreign key ties to an existing type.
 * A name that matches an existing type exactly keeps that type as it is, spaces included
 * (older data can hold 'X  Y' or ' SPIRIT '). Any other name is tidied first, so it may
 * match a type that already has the tidy form.
 * Returns the name of the type the category goes under.
 */
export async function ensureCategoryType(db: Db, name: string): Promise<string> {
  const existing = await db.categoryType.findUnique({ where: { name } });
  if (existing) return existing.name;
  const typeName = newCategoryTypeName(name);
  // Only an edit sends the type untrimmed: a blank one would create a type with no name
  if (!typeName) throw new BadRequestError();
  await db.categoryType.upsert({ where: { name: typeName }, update: {}, create: { name: typeName, color: 'gray' } });
  return typeName;
}
