import { Prisma } from '../generated/prisma/client';
import { BadRequestError } from '../errors';
import { RequiredText } from '../validation/common';
import { toValidationIssue } from '../validation/validate';

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
  if (!typeName) throw blankTypeError(name);
  await db.categoryType.upsert({ where: { name: typeName }, update: {}, create: { name: typeName, color: 'gray' } });
  return typeName;
}

/**
 * The 400 of the `validate` middleware for a blank type, which would create a type with no name.
 * Only the category creation and edit send the type untrimmed (the imports' schemas refuse a
 * blank one), so the issue names its `body.type`.
 */
function blankTypeError(name: string): BadRequestError {
  const issues = RequiredText.safeParse(name).error?.issues ?? [];
  return new BadRequestError('errors.validationError', issues.map((issue) => toValidationIssue(['body', 'type'], issue)));
}
