import { Prisma } from '../generated/prisma/client';
import { BadRequestError } from '../errors';
import { RequiredText } from '../validation/common';
import { toValidationIssue } from '../validation/validate';
import { tidyName } from '../utils/invisibleCharacters';

type Db = Prisma.TransactionClient;

/**
 * The name a new category type is stored under: without the characters HTML draws as nothing
 * (zero-width space, soft hyphen…), in the composed form (NFC), without spaces around it, and with
 * every run of spaces inside it reduced to one space, blank characters such as the braille pattern
 * blank included. HTML shows 'X\u200BY' exactly like 'XY', 'X  Y' like 'X Y', and 'E\u0300' like 'È',
 * so two types that differ only there could not be told apart.
 */
export function newCategoryTypeName(name: string): string {
  return tidyName(name);
}

/**
 * `newCategoryTypeName`, refused with the 400 of the `validate` middleware for the field at `path`
 * when nothing is left: the schemas let through a name of invisible characters, and a type that is
 * not trimmed, which would create a type with no name.
 */
export function requireNewCategoryTypeName(name: string, path: PropertyKey[]): string {
  const typeName = newCategoryTypeName(name);
  const checked = RequiredText.safeParse(typeName);
  if (!checked.success) {
    throw new BadRequestError('errors.validationError', checked.error.issues.map((issue) => toValidationIssue(path, issue)));
  }
  return typeName;
}

/**
 * A category may name a type that does not exist yet: it is created, in gray,
 * before the category, which the foreign key ties to an existing type.
 * A name that matches an existing type exactly keeps that type as it is, spaces, invisible
 * characters and decomposed letters included (older data can hold 'X  Y', ' SPIRIT ', 'X\u200BY'
 * or 'E\u0300'). Any other name is tidied first, so it may match a type that already has the tidy
 * form.
 * Returns the name of the type the category goes under.
 * `typePath` is where the request sent the name: a blank new name is refused with a 400 that
 * points there, like the other issues of the request. The default is the category routes' own.
 */
export async function ensureCategoryType(db: Db, name: string, typePath: PropertyKey[] = ['body', 'type']): Promise<string> {
  const existing = await db.categoryType.findUnique({ where: { name } });
  if (existing) return existing.name;
  const typeName = requireNewCategoryTypeName(name, typePath);
  await db.categoryType.upsert({ where: { name: typeName }, update: {}, create: { name: typeName, color: 'gray' } });
  return typeName;
}
