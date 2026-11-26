import fs from 'fs';
import path from 'path';
import type { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/**
 * Replays migrations on a temporary database, to test one of them on the
 * schema and rows an existing instance has. Scripts run through the adapter's
 * executeScript, as one SQLite script, like `prisma migrate deploy` does.
 */

export type Connection = Awaited<ReturnType<PrismaBetterSqlite3['connect']>>;
type Row = Record<string, unknown>;

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

export function migrationScript(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
}

/** The migrations that run before `name`, in their order. */
export function migrationsBefore(name: string): string[] {
  return fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < name)
    .map((entry) => entry.name)
    .sort();
}

export async function selectRows(db: Connection, sql: string): Promise<Row[]> {
  const result = await db.queryRaw({ sql, args: [], argTypes: [] });
  return result.rows.map((values) => Object.fromEntries(result.columnNames.map((column, i) => [column, values[i]])));
}
