import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { latestAppMigration, readSchemaVersion, resolveDatabasePath } from './backupService';

const prismaDir = path.resolve(__dirname, '../../prisma');

describe('resolveDatabasePath', () => {
  it('should resolve a relative path from the folder of schema.prisma', () => {
    expect(resolveDatabasePath('file:./x.db')).toBe(path.join(prismaDir, 'x.db'));
  });

  it('should keep an absolute path', () => {
    expect(resolveDatabasePath('file:/abs/x.db')).toBe(path.resolve('/abs/x.db'));
  });

  it('should drop the URL parameters', () => {
    expect(resolveDatabasePath('file:./x.db?connection_limit=1')).toBe(path.join(prismaDir, 'x.db'));
  });

  it('should refuse a URL that is not a SQLite file', () => {
    expect(() => resolveDatabasePath('postgresql://localhost/carta')).toThrow('file:');
  });
});

describe('with a temporary folder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-backup-service-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('latestAppMigration', () => {
    it('should return the newest migration folder', () => {
      for (const name of ['0_init', '20261010173910_schema_integrity', '20260101000000_older']) {
        fs.mkdirSync(path.join(tmpDir, name));
      }
      fs.writeFileSync(path.join(tmpDir, 'migration_lock.toml'), '');

      expect(latestAppMigration(tmpDir)).toBe('20261010173910_schema_integrity');
    });

    it('should return null without migrations', () => {
      expect(latestAppMigration(path.join(tmpDir, 'missing'))).toBeNull();
      expect(latestAppMigration(tmpDir)).toBeNull();
    });

    it('should find the migrations shipped with the application', () => {
      expect(latestAppMigration()).toMatch(/^\d+_/);
    });
  });

  describe('readSchemaVersion', () => {
    let client: PrismaClient;

    beforeEach(() => {
      client = new PrismaClient({ datasourceUrl: `file:${path.join(tmpDir, 'test.db')}` });
    });

    afterEach(async () => {
      await client.$disconnect();
    });

    it('should return null for a database without migrations table', async () => {
      await client.$executeRawUnsafe('CREATE TABLE Other (id INTEGER)');

      expect(await readSchemaVersion(client)).toBeNull();
    });

    it('should return the last finished migration', async () => {
      await client.$executeRawUnsafe(
        'CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL, finished_at DATETIME)',
      );
      await client.$executeRawUnsafe(`INSERT INTO _prisma_migrations VALUES
        ('1', '0_init', '2026-10-01 10:00:00'),
        ('2', '20261010173910_schema_integrity', '2026-10-10 10:00:00'),
        ('3', '20261011000000_failed', NULL)`);

      expect(await readSchemaVersion(client)).toBe('20261010173910_schema_integrity');
    });

    it('should return null when no migration finished', async () => {
      await client.$executeRawUnsafe(
        'CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL, finished_at DATETIME)',
      );

      expect(await readSchemaVersion(client)).toBeNull();
    });
  });
});
