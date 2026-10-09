import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { checkpointWal, configureSqlite } from './prisma';

// WAL needs a local file system, so these databases live in the OS temp folder
let tmpDir: string;
let dbUrl: string;
const clients: PrismaClient[] = [];

function openClient(): PrismaClient {
  const client = new PrismaClient({ datasourceUrl: dbUrl });
  clients.push(client);
  return client;
}

/** A client whose raw queries all return these rows, for answers a real file cannot be forced to give. */
function fakeClient(rows: Record<string, unknown>[]): PrismaClient {
  return { $queryRawUnsafe: async () => rows } as unknown as PrismaClient;
}

async function readPragma(client: PrismaClient, pragma: string): Promise<string> {
  const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(`PRAGMA ${pragma};`);
  return String(Object.values(rows[0])[0]);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-sqlite-'));
  dbUrl = `file:${path.join(tmpDir, 'test.db')}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('configureSqlite', () => {
  it('should switch the database to WAL by default', async () => {
    const client = openClient();

    expect(await configureSqlite(client, {})).toBe('wal');
    expect(await readPragma(client, 'journal_mode')).toBe('wal');
  });

  it('should store WAL in the file so a new client sees it', async () => {
    await configureSqlite(openClient(), {});

    expect(await readPragma(openClient(), 'journal_mode')).toBe('wal');
  });

  it('should keep the rollback journal when SQLITE_WAL is false', async () => {
    const client = openClient();

    expect(await configureSqlite(client, { SQLITE_WAL: 'false' })).toBe('delete');
    expect(await readPragma(client, 'journal_mode')).toBe('delete');
  });

  it('should switch a WAL database back to the rollback journal when SQLITE_WAL is false', async () => {
    const client = openClient();
    await configureSqlite(client, {});

    expect(await configureSqlite(client, { SQLITE_WAL: 'false' })).toBe('delete');
    expect(await readPragma(openClient(), 'journal_mode')).toBe('delete');
  });

  it('should warn when SQLite keeps another mode than the one requested', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // SQLite answers with the mode it kept instead of failing
    const refusingClient = fakeClient([{ journal_mode: 'delete' }]);

    expect(await configureSqlite(refusingClient, {})).toBe('delete');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not wal'));
  });

  it('should not warn when the requested mode is applied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await configureSqlite(openClient(), {});

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('checkpointWal', () => {
  it('should move WAL content into the database file and empty the WAL', async () => {
    const client = openClient();
    await configureSqlite(client, {});
    await client.$executeRawUnsafe('CREATE TABLE item (name TEXT);');
    await client.$executeRawUnsafe("INSERT INTO item VALUES ('lime');");

    await checkpointWal(client);

    expect(fs.statSync(path.join(tmpDir, 'test.db-wal')).size).toBe(0);
    // The .db file alone, as the backup export archives it
    const copy = path.join(tmpDir, 'copy.db');
    fs.copyFileSync(path.join(tmpDir, 'test.db'), copy);
    dbUrl = `file:${copy}`;
    const rows = await openClient().$queryRawUnsafe<{ name: string }[]>('SELECT name FROM item;');
    expect(rows).toEqual([{ name: 'lime' }]);
  });

  it('should do nothing on a database in rollback journal mode', async () => {
    await expect(checkpointWal(openClient())).resolves.toBeUndefined();
  });

  it('should fail when the checkpoint is blocked', async () => {
    const blockedClient = fakeClient([{ busy: 1, log: 3, checkpointed: 0 }]);

    await expect(checkpointWal(blockedClient)).rejects.toThrow('database is busy');
  });
});

describe('prisma client pool', () => {
  // lib/prisma.ts relies on this default instead of a per-connection pragma:
  // the check fails if a Prisma upgrade drops it
  it('should wait on a locked database on every pooled connection', async () => {
    const client = openClient();
    const timeouts = await Promise.all(
      Array.from({ length: 20 }, () => readPragma(client, 'busy_timeout')),
    );

    for (const timeout of timeouts) {
      expect(Number(timeout)).toBeGreaterThanOrEqual(5000);
    }
  });
});
