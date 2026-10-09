import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { configureSqlite } from './prisma';

// WAL needs a local file system, so these databases live in the OS temp folder
let tmpDir: string;
let dbUrl: string;
const clients: PrismaClient[] = [];

function openClient(): PrismaClient {
  const client = new PrismaClient({ datasourceUrl: dbUrl });
  clients.push(client);
  return client;
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
