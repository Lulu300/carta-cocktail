import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { type Connection, migrationScript, migrationsBefore, selectRows } from './migrationReplay';

/**
 * Replays the category_type_relation migration on a database at the schema of
 * the previous migrations, holding the rows an existing instance may have.
 */

const MIGRATION = '20261124120000_category_type_relation';

let dir: string;
let db: Connection;

function select(sql: string) {
  return selectRows(db, sql);
}

// The adapter throws a failed script synchronously: an async function turns it into a rejection
async function run(script: string): Promise<void> {
  await db.executeScript(script);
}

function migrate(): Promise<void> {
  return run(migrationScript(MIGRATION));
}

// The seed's three types, then categories as found on existing instances: a type
// without its CategoryType row (used twice), and a lowercase variant of a seeded type.
const PREVIOUS_DATA = `
  INSERT INTO "CategoryType" ("name", "nameTranslations", "color") VALUES
    ('SPIRIT', '{"fr":"Alcool","en":"Spirit"}', 'blue'), ('SYRUP', NULL, 'purple'), ('SOFT', NULL, 'green');
  INSERT INTO "Category" ("id", "name", "nameTranslations", "type", "desiredStock", "minimumPercent", "createdAt") VALUES
    (1, 'Rum', '{"fr":"Rhum"}', 'SPIRIT', 2, 25, 1700000000000),
    (2, 'Orange juice', NULL, 'JUICE', 1, 30, 1700000000001),
    (3, 'Apple juice', NULL, 'JUICE', 0, 10, 1700000000002),
    (4, 'Lime cordial', NULL, 'syrup', 1, 30, 1700000000003);
  INSERT INTO "Bottle" ("id", "name", "categoryId", "capacityMl", "createdAt") VALUES (1, 'Fresh', 2, 1000, 1700000000000);
  INSERT INTO "Unit" ("id", "name", "abbreviation") VALUES (1, 'Centilitre', 'cl');
  INSERT INTO "Cocktail" ("id", "name", "createdAt", "updatedAt") VALUES (1, 'Screwdriver', 1700000000000, 1700000000000);
  INSERT INTO "CocktailIngredient" ("id", "cocktailId", "quantity", "unitId", "sourceType", "categoryId")
    VALUES (1, 1, 10, 1, 'CATEGORY', 2);
`;

const ALL_CATEGORIES = 'SELECT * FROM "Category" ORDER BY "id"';
const ALL_TYPES = 'SELECT * FROM "CategoryType" ORDER BY "name"';

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-migration-'));
  db = await new PrismaBetterSqlite3({ url: path.join(dir, 'previous.db') }).connect();
  for (const name of migrationsBefore(MIGRATION)) {
    await db.executeScript(migrationScript(name));
  }
  await db.executeScript(PREVIOUS_DATA);
});

afterEach(async () => {
  await db.dispose();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('category_type_relation migration', () => {
  it('should create each missing type once, in gray, and leave the existing types as they were', async () => {
    await migrate();

    // SQLite compares the names case-sensitively: "syrup" is a type of its own
    expect(await select(ALL_TYPES)).toEqual([
      { name: 'JUICE', nameTranslations: null, color: 'gray' },
      { name: 'SOFT', nameTranslations: null, color: 'green' },
      { name: 'SPIRIT', nameTranslations: '{"fr":"Alcool","en":"Spirit"}', color: 'blue' },
      { name: 'SYRUP', nameTranslations: null, color: 'purple' },
      { name: 'syrup', nameTranslations: null, color: 'gray' },
    ]);
  });

  it('should keep every category, column and reference', async () => {
    const categoriesBefore = await select(ALL_CATEGORIES);

    await migrate();

    expect(await select(ALL_CATEGORIES)).toEqual(categoriesBefore);
    expect(await select('SELECT "categoryId" FROM "Bottle"')).toEqual([{ categoryId: 2 }]);
    expect(await select('SELECT "categoryId" FROM "CocktailIngredient"')).toEqual([
      { categoryId: 2 },
    ]);
    expect(await select('PRAGMA foreign_key_check')).toEqual([]);
    expect(await select('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('should give the same result when it runs a second time', async () => {
    await migrate();
    const typesAfterFirstRun = await select(ALL_TYPES);
    const categoriesAfterFirstRun = await select(ALL_CATEGORIES);

    await migrate();

    expect(await select(ALL_TYPES)).toEqual(typesAfterFirstRun);
    expect(await select(ALL_CATEGORIES)).toEqual(categoriesAfterFirstRun);
  });

  it('should refuse a category of an unknown type and the deletion of a used type', async () => {
    await migrate();

    await expect(
      run(`INSERT INTO "Category" ("name", "type") VALUES ('Tonic', 'MIXER')`),
    ).rejects.toThrow('ForeignKeyConstraintViolation');
    await expect(run(`DELETE FROM "CategoryType" WHERE "name" = 'JUICE'`)).rejects.toThrow(
      'ForeignKeyConstraintViolation',
    );
  });

  it('should carry a type rename to its categories', async () => {
    await migrate();

    await db.executeScript(
      `UPDATE "CategoryType" SET "name" = 'FRUIT JUICE' WHERE "name" = 'JUICE'`,
    );

    expect(await select('SELECT "id", "type" FROM "Category" ORDER BY "id"')).toEqual([
      { id: 1, type: 'SPIRIT' },
      { id: 2, type: 'FRUIT JUICE' },
      { id: 3, type: 'FRUIT JUICE' },
      { id: 4, type: 'syrup' },
    ]);
  });
});
