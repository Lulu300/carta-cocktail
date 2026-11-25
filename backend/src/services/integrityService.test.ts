import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData,
  prisma, seedCategory, seedUnit, seedCocktail, seedCocktailUsing,
} from '../test/helpers';
import {
  findIntegrityIssues, hasBlockingIssues, countIssues, formatIntegrityReport, IntegrityIssues,
} from './integrityService';

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });
beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

const NO_ISSUES: IntegrityIssues = {
  duplicateCategoryNames: [],
  duplicateUnitAbbreviations: [],
  duplicateCocktailNames: [],
  invalidIngredientLines: [],
  unknownCategoryTypes: [],
  foreignKeyViolations: [],
};

describe('findIntegrityIssues', () => {
  it('finds no issue in a clean database', async () => {
    await seedCategory({ name: 'Rum' });
    await seedUnit();
    await seedCocktail({ name: 'Mojito' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues).toEqual(NO_ISSUES);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('reports category names that differ only by case as blocking', async () => {
    await seedCategory({ name: 'Rhum' });
    await seedCategory({ name: 'rhum' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateCategoryNames).toEqual([{ value: 'rhum', count: 2 }]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('reports duplicate unit abbreviations as blocking', async () => {
    // Duplicates can only exist in a database that predates the unique index
    await prisma.$executeRawUnsafe('DROP INDEX "Unit_abbreviation_key"');
    try {
      await seedUnit({ name: 'Centilitre' });
      await seedUnit({ name: 'Centiliter' });

      const issues = await findIntegrityIssues(prisma);

      expect(issues.duplicateUnitAbbreviations).toEqual([{ value: 'cl', count: 2 }]);
      expect(hasBlockingIssues(issues)).toBe(true);
    } finally {
      await prisma.unit.deleteMany();
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "Unit_abbreviation_key" ON "Unit"("abbreviation")');
    }
  });

  it('reports unit abbreviations that differ only by case as blocking', async () => {
    await seedUnit({ abbreviation: 'cl' });
    await seedUnit({ abbreviation: 'CL' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateUnitAbbreviations).toEqual([{ value: 'cl', count: 2 }]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  // SQLite's lower() only changes ASCII letters: the names are compared in JS (C-65)
  it('reports category names that differ by the case of an accented letter, or by Unicode form', async () => {
    await seedCategory({ name: '\u00C9corce' });
    await seedCategory({ name: '\u00E9corce' });
    await seedCategory({ name: 'Cr\u00E8me' });
    await seedCategory({ name: 'Cre\u0300me' });
    await seedCategory({ name: 'Gin' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateCategoryNames).toEqual([{ value: 'cr\u00E8me', count: 2 }, { value: '\u00E9corce', count: 2 }]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('reports unit abbreviations that differ by the case of an accented letter, or by Unicode form', async () => {
    await seedUnit({ abbreviation: '\u00E9corce' });
    await seedUnit({ abbreviation: 'E\u0301CORCE' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateUnitAbbreviations).toEqual([{ value: '\u00E9corce', count: 2 }]);
  });

  it('lists cocktail names that differ by Unicode form without blocking', async () => {
    await seedCocktail({ name: 'Caf\u00E9' });
    await seedCocktail({ name: 'CAFE\u0301' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateCocktailNames).toEqual([{ value: 'caf\u00E9', count: 2 }]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('sorts the duplicates by value, whatever the order of the rows', async () => {
    await seedCocktail({ name: 'Zombie' });
    await seedCocktail({ name: 'Mojito' });
    await seedCocktail({ name: 'ZOMBIE' });
    await seedCocktail({ name: 'MOJITO' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateCocktailNames).toEqual([{ value: 'mojito', count: 2 }, { value: 'zombie', count: 2 }]);
  });

  it('lists duplicate cocktail names without blocking', async () => {
    await seedCocktail({ name: 'Mojito' });
    await seedCocktail({ name: 'mojito' });

    const issues = await findIntegrityIssues(prisma);

    expect(issues.duplicateCocktailNames).toEqual([{ value: 'mojito', count: 2 }]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('reports recipe lines without their source', async () => {
    const unit = await seedUnit();
    const cocktail = await seedCocktailUsing('Broken', unit.id, [{ sourceType: 'BOTTLE' }]);

    const issues = await findIntegrityIssues(prisma);

    expect(issues.invalidIngredientLines).toEqual([
      { id: expect.any(Number), cocktailId: cocktail.id, sourceType: 'BOTTLE' },
    ]);
  });

  // Since the category_type_relation migration, the foreign key refuses such a
  // category: the audit still finds it in a database that is not migrated yet,
  // reproduced here with the foreign keys switched off.
  it('reports category types missing from CategoryType', async () => {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    try {
      await seedCategory({ name: 'Orange juice', type: 'JUICE' });
    } finally {
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    }

    const issues = await findIntegrityIssues(prisma);

    expect(issues.unknownCategoryTypes).toEqual(['JUICE']);
    expect(issues.foreignKeyViolations).toEqual([{ table: 'Category', rowid: expect.any(Number), parent: 'CategoryType' }]);
  });
});

describe('formatIntegrityReport', () => {
  const issues: IntegrityIssues = {
    ...NO_ISSUES,
    duplicateCategoryNames: [{ value: 'rhum', count: 2 }],
    foreignKeyViolations: [{ table: 'Bottle', rowid: 4, parent: 'Category' }],
  };

  it('counts each kind of issue', () => {
    expect(countIssues(issues)).toEqual({
      duplicateCategoryNames: 1,
      duplicateUnitAbbreviations: 0,
      duplicateCocktailNames: 0,
      invalidIngredientLines: 0,
      unknownCategoryTypes: 0,
      foreignKeyViolations: 1,
    });
  });

  it('lists the values found, then the result', () => {
    const report = formatIntegrityReport(issues);
    expect(report).toContain('Duplicate category names, ignoring case (blocking): 1');
    expect(report).toContain('"value":"rhum"');
    expect(report).toContain('"table":"Bottle"');
    expect(report).toMatch(/Result: BLOCKING issues found$/);
  });

  it('holds counts only, without any value from the database, with countsOnly', () => {
    const report = formatIntegrityReport(issues, true);
    expect(report).toContain('Rows referencing a missing row: 1');
    expect(report).not.toContain('rhum');
    expect(report).not.toContain('Bottle"');
  });

  it('ends with a clean result when nothing blocks', () => {
    expect(formatIntegrityReport(NO_ISSUES)).toMatch(/Result: no blocking issue$/);
  });
});
