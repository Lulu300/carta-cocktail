import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma,
} from '../test/helpers';
import { applySessionFloor, sessionFloorPath, writeSessionFloor } from './sessionFloor';

const TOKEN_VERSION_MIGRATION = path.resolve(
  __dirname, '../../prisma/migrations/20261011120000_user_token_version/migration.sql',
);

let dir: string;
let dbPath: string;

async function storedTokenVersion(): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: 1 } })).tokenVersion;
}

async function setTokenVersion(tokenVersion: number): Promise<void> {
  await prisma.user.update({ where: { id: 1 }, data: { tokenVersion } });
}

beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  // Only the floor file is read from the database's folder
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-floor-'));
  dbPath = path.join(dir, 'carta_cocktail.db');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('applySessionFloor', () => {
  it('should change nothing without a floor file', async () => {
    await setTokenVersion(2);

    await applySessionFloor(dbPath);

    expect(await storedTokenVersion()).toBe(2);
  });

  it('should raise every user above the floor, then delete the file', async () => {
    writeSessionFloor(dbPath, 3);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await applySessionFloor(dbPath);

    expect(await storedTokenVersion()).toBe(4);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('should only add one more sign-out when a left-over floor is applied again', async () => {
    writeSessionFloor(dbPath, 3);
    await setTokenVersion(7);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await applySessionFloor(dbPath);

    expect(await storedTokenVersion()).toBe(8);
  });

  it('should keep the revocation and warn when the file cannot be deleted', async () => {
    writeSessionFloor(dbPath, 3);
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw new Error('rm failed');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await applySessionFloor(dbPath);

    expect(await storedTokenVersion()).toBe(4);
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['not a number', 'abc'],
    ['negative', '-1'],
    ['not an integer', '2.5'],
  ])('should refuse to start, keep the file and change nothing when it is %s', async (_label, content) => {
    fs.writeFileSync(sessionFloorPath(dbPath), content);

    await expect(applySessionFloor(dbPath)).rejects.toThrow(/JWT_SECRET/);

    expect(await storedTokenVersion()).toBe(0);
    expect(fs.existsSync(sessionFloorPath(dbPath))).toBe(true);
  });

  it('should refuse to start and keep the file until the migrations have added the column', async () => {
    writeSessionFloor(dbPath, 3);
    await prisma.$executeRawUnsafe('ALTER TABLE "User" DROP COLUMN "tokenVersion"');

    try {
      await expect(applySessionFloor(dbPath)).rejects.toThrow(/session-floor .*npm run db:deploy/s);
      expect(fs.existsSync(sessionFloorPath(dbPath))).toBe(true);
    } finally {
      // The test database is shared: put the column back as the migration does
      await prisma.$executeRawUnsafe(fs.readFileSync(TOKEN_VERSION_MIGRATION, 'utf8'));
    }
  });

  it('should refuse to start when the file cannot be read', async () => {
    // A folder in place of the file: reading it fails (EISDIR)
    fs.mkdirSync(sessionFloorPath(dbPath));

    await expect(applySessionFloor(dbPath)).rejects.toThrow(/Cannot read .*EISDIR.*JWT_SECRET/s);
  });
});
