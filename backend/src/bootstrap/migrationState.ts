import fs from 'fs';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * What `prisma migrate deploy` will find at the next start, read from the
 * migration history (`_prisma_migrations`). docker-entrypoint.sh decides from it
 * whether to back up the database before the migrations, and names the failed
 * migration when the deploy stops.
 *
 * `prisma migrate status` cannot answer this: after `prisma migrate resolve
 * --rolled-back`, it reports the database as up to date although the migration
 * will run again.
 */
export interface MigrationState {
  /** Migrations of the migrations folder that the deploy would apply. */
  unapplied: string[];
  /** Migrations whose last attempt did not finish: the deploy refuses to run (P3009). */
  failed: string[];
}

/** Every subfolder of the migrations folder is a migration, as for Prisma; sorted like Prisma applies them. */
export function listLocalMigrations(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function hasMigrationHistory(client: PrismaClient): Promise<boolean> {
  const tables = await client.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'`;
  return tables.length > 0;
}

type MigrationRow = { migration_name: string };

// A rolled back row never counts, for Prisma either: the migration runs again.
async function appliedMigrations(client: PrismaClient): Promise<Set<string>> {
  const rows = await client.$queryRaw<MigrationRow[]>`
    SELECT DISTINCT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return new Set(rows.map((row) => row.migration_name));
}

async function failedMigrations(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<MigrationRow[]>`
    SELECT DISTINCT migration_name FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  return rows.map((row) => row.migration_name);
}

/**
 * A migration is applied when it has a finished row that is not rolled back.
 * A database without history (created by `db push`) has every migration to
 * apply. Read-only.
 */
export async function readMigrationState(client: PrismaClient, migrationsDir: string): Promise<MigrationState> {
  const local = listLocalMigrations(migrationsDir);
  if (!(await hasMigrationHistory(client))) {
    return { unapplied: local, failed: [] };
  }
  const applied = await appliedMigrations(client);
  return {
    unapplied: local.filter((name) => !applied.has(name)),
    failed: await failedMigrations(client),
  };
}

/**
 * The last line of an error message: Prisma puts the cause there
 * ("Raw query failed. Code: `SQLITE_NOTADB`…"), after the invocation and blank lines.
 */
export function summarizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lines = message.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : 'unknown error';
}

/** One line per migration, "unapplied <name>" or "failed <name>", read by docker-entrypoint.sh. */
export function formatMigrationState(state: MigrationState): string {
  return [
    ...state.unapplied.map((name) => `unapplied ${name}`),
    ...state.failed.map((name) => `failed ${name}`),
  ].join('\n');
}
