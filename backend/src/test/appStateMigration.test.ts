import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { type Connection, migrationScript, migrationsBefore, selectRows } from './migrationReplay';

/**
 * Replays the app_state migration on a database at the schema of the previous
 * migrations, holding the rows of an instance in service.
 */

const MIGRATION = '20261126120000_app_state';

const PREVIOUS_DATA = `
  INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "tokenVersion")
    VALUES (1, 'admin@carta.local', 'hash', 1700000000000, 3);
  INSERT INTO "SiteSettings" ("id", "siteName", "siteIcon") VALUES (1, 'Chez nous', '🍹');
  INSERT INTO "CategoryType" ("name", "color") VALUES ('SPIRIT', 'blue');
  INSERT INTO "Category" ("id", "name", "type", "createdAt") VALUES (1, 'Rum', 'SPIRIT', 1700000000000);
  INSERT INTO "Bottle" ("id", "name", "categoryId", "capacityMl", "createdAt") VALUES (1, 'Havana 3', 1, 700, 1700000000000);
`;

const TABLES_BEFORE = ['User', 'SiteSettings', 'CategoryType', 'Category', 'Bottle'];

let dir: string;
let db: Connection;

function select(sql: string) {
  return selectRows(db, sql);
}

async function rowsOf(tables: string[]): Promise<Record<string, unknown[]>> {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) rows[table] = await select(`SELECT * FROM "${table}"`);
  return rows;
}

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

describe('app_state migration', () => {
  it('should add an empty AppState table and leave every other row as it was', async () => {
    const rowsBefore = await rowsOf(TABLES_BEFORE);

    await db.executeScript(migrationScript(MIGRATION));

    expect(await select('SELECT * FROM "AppState"')).toEqual([]);
    expect(
      await select('SELECT "name" FROM pragma_table_info(\'AppState\') ORDER BY "cid"'),
    ).toEqual([
      { name: 'id' },
      { name: 'lastRunVersion' },
      { name: 'pendingNoticeFrom' },
      { name: 'pendingNoticeTo' },
      { name: 'noticeAcknowledgedAt' },
    ]);
    expect(await rowsOf(TABLES_BEFORE)).toEqual(rowsBefore);
    expect(await select('PRAGMA foreign_key_check')).toEqual([]);
    expect(await select('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('should give the single row the id 1 by default', async () => {
    await db.executeScript(migrationScript(MIGRATION));

    await db.executeScript(`INSERT INTO "AppState" ("lastRunVersion") VALUES ('1.17.0')`);

    expect(
      await select('SELECT "id", "lastRunVersion", "pendingNoticeFrom" FROM "AppState"'),
    ).toEqual([{ id: 1, lastRunVersion: '1.17.0', pendingNoticeFrom: null }]);
  });
});
