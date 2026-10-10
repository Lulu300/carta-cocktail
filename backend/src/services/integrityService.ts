import { PrismaClient } from '@prisma/client';

/**
 * Read-only audit of the data that the schema does not protect (or did not
 * protect before the schema_integrity migration). Run it on a copy of a
 * production database before upgrading: scripts/check-integrity.ts.
 *
 * The queries use raw SQL on columns that already exist in older schemas, so
 * the audit also works on a database that has not been migrated yet.
 */

/** Only raw queries are needed: any client or transaction client fits. */
export type IntegrityDb = Pick<PrismaClient, '$queryRaw'>;

export interface DuplicateGroup {
  value: string;
  count: number;
}

export interface InvalidIngredientLine {
  id: number;
  cocktailId: number;
  sourceType: string;
}

export interface ForeignKeyViolation {
  table: string;
  rowid: number;
  parent: string;
}

export interface IntegrityIssues {
  /** Same name ignoring case. Blocking: the migration refuses exact duplicates, and imports match names ignoring case. */
  duplicateCategoryNames: DuplicateGroup[];
  /** Same abbreviation ignoring case. Blocking: the migration refuses exact duplicates, and the routes refuse case-only ones. */
  duplicateUnitAbbreviations: DuplicateGroup[];
  /** Same name ignoring case. Allowed (cocktail names are not unique), listed for information. */
  duplicateCocktailNames: DuplicateGroup[];
  /** Recipe lines whose source (bottle, category or ingredient) is missing: the cocktail is never available. */
  invalidIngredientLines: InvalidIngredientLine[];
  /** Category types that have no CategoryType row. */
  unknownCategoryTypes: string[];
  /** Rows pointing to a row that no longer exists (only possible if foreign keys were disabled). */
  foreignKeyViolations: ForeignKeyViolation[];
}

export type IntegrityCounts = Record<keyof IntegrityIssues, number>;

// SQLite returns COUNT(*) as a BigInt through Prisma
interface RawDuplicate {
  value: string;
  count: bigint | number;
}

function toDuplicateGroups(rows: RawDuplicate[]): DuplicateGroup[] {
  return rows.map((row) => ({ value: row.value, count: Number(row.count) }));
}

export async function findIntegrityIssues(db: IntegrityDb): Promise<IntegrityIssues> {
  const duplicateCategoryNames = await db.$queryRaw<RawDuplicate[]>`
    SELECT lower(name) AS value, COUNT(*) AS count FROM Category
    GROUP BY value HAVING count > 1 ORDER BY value`;
  const duplicateUnitAbbreviations = await db.$queryRaw<RawDuplicate[]>`
    SELECT lower(abbreviation) AS value, COUNT(*) AS count FROM Unit
    GROUP BY value HAVING count > 1 ORDER BY value`;
  const duplicateCocktailNames = await db.$queryRaw<RawDuplicate[]>`
    SELECT lower(name) AS value, COUNT(*) AS count FROM Cocktail
    GROUP BY value HAVING count > 1 ORDER BY value`;
  const invalidIngredientLines = await db.$queryRaw<InvalidIngredientLine[]>`
    SELECT id, cocktailId, sourceType FROM CocktailIngredient
    WHERE (sourceType = 'BOTTLE' AND bottleId IS NULL)
       OR (sourceType = 'CATEGORY' AND categoryId IS NULL)
       OR (sourceType = 'INGREDIENT' AND ingredientId IS NULL)
       OR sourceType NOT IN ('BOTTLE', 'CATEGORY', 'INGREDIENT')
    ORDER BY id`;
  const unknownCategoryTypes = await db.$queryRaw<{ type: string }[]>`
    SELECT DISTINCT type FROM Category
    WHERE type NOT IN (SELECT name FROM CategoryType) ORDER BY type`;
  const foreignKeyViolations = await db.$queryRaw<ForeignKeyViolation[]>`
    SELECT "table", rowid, parent FROM pragma_foreign_key_check`;

  return {
    duplicateCategoryNames: toDuplicateGroups(duplicateCategoryNames),
    duplicateUnitAbbreviations: toDuplicateGroups(duplicateUnitAbbreviations),
    duplicateCocktailNames: toDuplicateGroups(duplicateCocktailNames),
    invalidIngredientLines: invalidIngredientLines.map((line) => ({
      ...line,
      id: Number(line.id),
      cocktailId: Number(line.cocktailId),
    })),
    unknownCategoryTypes: unknownCategoryTypes.map((row) => row.type),
    foreignKeyViolations: foreignKeyViolations.map((row) => ({ ...row, rowid: Number(row.rowid) })),
  };
}

/** Issues that make the schema_integrity migration refuse to run, or the imports ambiguous. */
export function hasBlockingIssues(issues: IntegrityIssues): boolean {
  return issues.duplicateCategoryNames.length > 0 || issues.duplicateUnitAbbreviations.length > 0;
}

export function countIssues(issues: IntegrityIssues): IntegrityCounts {
  return {
    duplicateCategoryNames: issues.duplicateCategoryNames.length,
    duplicateUnitAbbreviations: issues.duplicateUnitAbbreviations.length,
    duplicateCocktailNames: issues.duplicateCocktailNames.length,
    invalidIngredientLines: issues.invalidIngredientLines.length,
    unknownCategoryTypes: issues.unknownCategoryTypes.length,
    foreignKeyViolations: issues.foreignKeyViolations.length,
  };
}

const LABELS: Record<keyof IntegrityIssues, string> = {
  duplicateCategoryNames: 'Duplicate category names, ignoring case (blocking)',
  duplicateUnitAbbreviations: 'Duplicate unit abbreviations, ignoring case (blocking)',
  duplicateCocktailNames: 'Duplicate cocktail names, ignoring case (allowed)',
  invalidIngredientLines: 'Recipe lines without their bottle, category or ingredient',
  unknownCategoryTypes: 'Category types missing from CategoryType',
  foreignKeyViolations: 'Rows referencing a missing row',
};

/**
 * Text report of the audit. With `countsOnly`, it holds counts only, no value
 * read from the database, so it can be shared without exposing personal data.
 */
export function formatIntegrityReport(issues: IntegrityIssues, countsOnly = false): string {
  const counts = countIssues(issues);
  const lines: string[] = [];
  for (const key of Object.keys(LABELS) as (keyof IntegrityIssues)[]) {
    lines.push(`${LABELS[key]}: ${counts[key]}`);
    if (countsOnly) continue;
    for (const item of issues[key]) {
      lines.push(`  - ${JSON.stringify(item)}`);
    }
  }
  lines.push(hasBlockingIssues(issues) ? 'Result: BLOCKING issues found' : 'Result: no blocking issue');
  return lines.join('\n');
}
