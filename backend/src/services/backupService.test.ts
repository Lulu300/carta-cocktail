import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '../generated/prisma/client';
import { createPrismaClient } from '../lib/prisma';
import { latestAppMigration, readSchemaVersion } from './backupService';

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
      client = createPrismaClient(`file:${path.join(tmpDir, 'test.db')}`);
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
