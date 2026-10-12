import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '../generated/prisma/client';
import { PRISMA_DIR } from '../lib/databasePath';
import { createPrismaClient } from '../lib/prisma';
import { formatMigrationState, listLocalMigrations, readMigrationState, summarizeError } from './migrationState';

// The table as `prisma migrate deploy` creates it in SQLite
const MIGRATIONS_TABLE = `CREATE TABLE "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

let tmpDir: string;
let migrationsDir: string;
let client: PrismaClient;

function addLocalMigration(name: string): void {
  fs.mkdirSync(path.join(migrationsDir, name));
  fs.writeFileSync(path.join(migrationsDir, name, 'migration.sql'), '-- migration\n');
}

type Attempt = 'applied' | 'failed' | 'rolled back' | 'rolled back after failing';

async function recordAttempt(name: string, attempt: Attempt): Promise<void> {
  const finishedAt = attempt === 'applied' || attempt === 'rolled back' ? Date.now() : null;
  const rolledBackAt = attempt.startsWith('rolled back') ? Date.now() : null;
  await client.$executeRaw`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, rolled_back_at)
    VALUES (${`${name}-${attempt}`}, 'checksum', ${finishedAt}, ${name}, ${rolledBackAt})`;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-migrations-'));
  migrationsDir = path.join(tmpDir, 'migrations');
  fs.mkdirSync(migrationsDir);
  fs.writeFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'provider = "sqlite"\n');
  ['0_init', '20261010173910_schema_integrity', '20261011120000_user_token_version'].forEach(addLocalMigration);
  client = createPrismaClient(`file:${path.join(tmpDir, 'carta.db')}`);
});

afterEach(async () => {
  await client.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('listLocalMigrations', () => {
  it('should list the migration folders in the order Prisma applies them, without the lock file', () => {
    addLocalMigration('1_second');

    expect(listLocalMigrations(migrationsDir)).toEqual([
      '0_init',
      '1_second',
      '20261010173910_schema_integrity',
      '20261011120000_user_token_version',
    ]);
  });

  it('should list the migrations of the repository, 0_init first', () => {
    const migrations = listLocalMigrations(path.join(PRISMA_DIR, 'migrations'));

    expect(migrations[0]).toBe('0_init');
    expect(migrations).toContain('20261010173910_schema_integrity');
  });
});

describe('readMigrationState', () => {
  it('should have every migration to apply on a database without history (created by db push)', async () => {
    await client.$executeRawUnsafe('CREATE TABLE "Category" ("id" INTEGER PRIMARY KEY)');

    const state = await readMigrationState(client, migrationsDir);

    expect(state).toEqual({
      unapplied: ['0_init', '20261010173910_schema_integrity', '20261011120000_user_token_version'],
      failed: [],
    });
  });

  it('should have nothing to apply when every migration is applied', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    for (const name of listLocalMigrations(migrationsDir)) await recordAttempt(name, 'applied');

    expect(await readMigrationState(client, migrationsDir)).toEqual({ unapplied: [], failed: [] });
  });

  it('should list the migrations newer than the history', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    await recordAttempt('0_init', 'applied');

    const state = await readMigrationState(client, migrationsDir);

    expect(state.unapplied).toEqual(['20261010173910_schema_integrity', '20261011120000_user_token_version']);
    expect(state.failed).toEqual([]);
  });

  it('should report a failed migration as failed and still to apply', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    await recordAttempt('0_init', 'applied');
    await recordAttempt('20261010173910_schema_integrity', 'failed');

    const state = await readMigrationState(client, migrationsDir);

    expect(state.failed).toEqual(['20261010173910_schema_integrity']);
    expect(state.unapplied).toEqual(['20261010173910_schema_integrity', '20261011120000_user_token_version']);
  });

  // `prisma migrate status` reports this database as up to date: the entrypoint
  // must still see the migration to apply, and back the database up first.
  it('should count a migration marked rolled back with migrate resolve as still to apply, not failed', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    await recordAttempt('0_init', 'applied');
    await recordAttempt('20261010173910_schema_integrity', 'rolled back after failing');
    await recordAttempt('20261011120000_user_token_version', 'rolled back');

    const state = await readMigrationState(client, migrationsDir);

    expect(state.unapplied).toEqual(['20261010173910_schema_integrity', '20261011120000_user_token_version']);
    expect(state.failed).toEqual([]);
  });

  it('should count a migration applied after a rolled back attempt as applied', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    for (const name of listLocalMigrations(migrationsDir)) await recordAttempt(name, 'applied');
    await recordAttempt('20261010173910_schema_integrity', 'rolled back after failing');

    expect(await readMigrationState(client, migrationsDir)).toEqual({ unapplied: [], failed: [] });
  });

  it('should report a failed migration that the migrations folder does not have', async () => {
    await client.$executeRawUnsafe(MIGRATIONS_TABLE);
    for (const name of listLocalMigrations(migrationsDir)) await recordAttempt(name, 'applied');
    await recordAttempt('20270101000000_newer_version', 'failed');

    expect(await readMigrationState(client, migrationsDir)).toEqual({
      unapplied: [],
      failed: ['20270101000000_newer_version'],
    });
  });
});

describe('formatMigrationState', () => {
  it('should print one line per migration, the ones to apply first', () => {
    const output = formatMigrationState({ unapplied: ['1_a', '2_b'], failed: ['1_a'] });

    expect(output).toBe('unapplied 1_a\nunapplied 2_b\nfailed 1_a');
  });

  it('should print nothing when there is nothing to apply', () => {
    expect(formatMigrationState({ unapplied: [], failed: [] })).toBe('');
  });
});

describe('summarizeError', () => {
  it('should keep the last line of a multi-line Prisma message', () => {
    const err = new Error('\nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `SQLITE_NOTADB`.\n');

    expect(summarizeError(err)).toBe('Raw query failed. Code: `SQLITE_NOTADB`.');
  });

  it('should describe a value that is not an Error', () => {
    expect(summarizeError('disk I/O error')).toBe('disk I/O error');
  });

  it('should not return an empty line', () => {
    expect(summarizeError(new Error(''))).toBe('unknown error');
  });
});
