import { PrismaClient } from '../generated/prisma/client';
import { caseInsensitiveKey } from '../utils/invisibleCharacters';

/**
 * Read-only audit of the data that the schema does not protect (or did not
 * protect before the schema_integrity migration). Run it on a copy of a
 * production database before upgrading: src/scripts/check-integrity.ts.
 *
 * The queries use raw SQL on columns that already exist in older schemas, so
 * the audit also works on a database that has not been migrated yet.
 *
 * Duplicates are grouped in JS, under the key the routes and the imports compare
 * names with (`caseInsensitiveKey`): SQLite's lower() only changes ASCII letters,
 * so it missed 'Écorce' and 'écorce', and a name and its decomposed form.
 */

/** Only raw queries are needed: any client or transaction client fits. */
export type IntegrityDb = Pick<PrismaClient, '$queryRaw'>;

export interface DuplicateGroup {
  /** The shared key: the name in lower case, composed (NFC). */
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
  /** Same name ignoring case and Unicode form. Blocking: the migration refuses exact duplicates, and imports match names ignoring case. */
  duplicateCategoryNames: DuplicateGroup[];
  /** Same abbreviation ignoring case and Unicode form. Blocking: the migration refuses exact duplicates, and the routes refuse case-only ones. */
  duplicateUnitAbbreviations: DuplicateGroup[];
  /** Same name ignoring case and Unicode form. Allowed (cocktail names are not unique), listed for information. */
  duplicateCocktailNames: DuplicateGroup[];
  /** Recipe lines whose source (bottle, category or ingredient) is missing: the cocktail is never available. */
  invalidIngredientLines: InvalidIngredientLine[];
  /** Category types that have no CategoryType row. Not blocking: the category_type_relation migration creates them. */
  unknownCategoryTypes: string[];
  /** Rows pointing to a row that no longer exists (only possible if foreign keys were disabled). */
  foreignKeyViolations: ForeignKeyViolation[];
}

export type IntegrityCounts = Record<keyof IntegrityIssues, number>;

/** The keys several values share, with their number of values, sorted by key. */
function duplicateGroups(rows: { value: string }[]): DuplicateGroup[] {
  const counts = new Map<string, number>();
  for (const { value } of rows) {
    const key = caseInsensitiveKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    Array.from(counts, ([value, count]) => ({ value, count }))
      .filter((group) => group.count > 1)
      // The keys are distinct: no two groups compare equal
      .sort((a, b) => (a.value < b.value ? -1 : 1))
  );
}

export async function findIntegrityIssues(db: IntegrityDb): Promise<IntegrityIssues> {
  const categoryNames = await db.$queryRaw<{ value: string }[]>`SELECT name AS value FROM Category`;
  const unitAbbreviations = await db.$queryRaw<
    { value: string }[]
  >`SELECT abbreviation AS value FROM Unit`;
  const cocktailNames = await db.$queryRaw<{ value: string }[]>`SELECT name AS value FROM Cocktail`;
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
    duplicateCategoryNames: duplicateGroups(categoryNames),
    duplicateUnitAbbreviations: duplicateGroups(unitAbbreviations),
    duplicateCocktailNames: duplicateGroups(cocktailNames),
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
  unknownCategoryTypes: 'Category types missing from CategoryType (created by the migration)',
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
  lines.push(
    hasBlockingIssues(issues) ? 'Result: BLOCKING issues found' : 'Result: no blocking issue',
  );
  return lines.join('\n');
}
