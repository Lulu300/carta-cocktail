import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { PrismaClient } from '@prisma/client';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, seedIngredient,
  prisma, request, authHeader,
} from '../test/helpers';
import { configureSqlite } from '../lib/prisma';

// Regression tests for the WAL guard in backup.ts (C-02). C-05 rewrites the
// backup routes and extends these tests.

const originalDatabaseUrl = process.env.DATABASE_URL;

async function exportBackup(): Promise<Buffer> {
  const res = await request
    .get('/api/backup/export')
    .set(authHeader())
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

/** Opens the database.db of a backup on its own, as a restore on another machine would. */
async function ingredientNamesInBackup(backup: Buffer): Promise<string[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-backup-'));
  const dbFile = path.join(dir, 'database.db');
  fs.writeFileSync(dbFile, new AdmZip(backup).getEntry('database.db')!.getData());
  const client = new PrismaClient({ datasourceUrl: `file:${dbFile}` });
  try {
    const ingredients = await client.ingredient.findMany({ orderBy: { name: 'asc' } });
    return ingredients.map((ingredient) => ingredient.name);
  } finally {
    await client.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function ingredientNames(): Promise<string[]> {
  const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
  return ingredients.map((ingredient) => ingredient.name);
}

beforeAll(async () => {
  await setupTestDatabase();
  expect(await configureSqlite(prisma, {})).toBe('wal');
  // backup.ts reads the file path from DATABASE_URL: give it the file Prisma
  // really opened (the relative test URL resolves elsewhere until B-03)
  const [main] = await prisma.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list;');
  process.env.DATABASE_URL = `file:${main.file}`;
});

afterAll(async () => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  // Leave no -wal file behind for the next test file's database
  await configureSqlite(prisma, { SQLITE_WAL: 'false' });
  await teardownTestDatabase();
});

beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
});

describe('backup in WAL mode', () => {
  it('should export writes that are still in the WAL file', async () => {
    await seedIngredient({ name: 'Lime' });

    const backup = await exportBackup();

    expect(await ingredientNamesInBackup(backup)).toEqual(['Lime']);
  });

  it('should restore a backup over newer writes, and keep the restore after later writes', async () => {
    await seedIngredient({ name: 'Lime' });
    const backup = await exportBackup();
    await seedIngredient({ name: 'Mint' });
    await seedIngredient({ name: 'Sugar' });

    const res = await request
      .post('/api/backup/import')
      .set(authHeader())
      .attach('backup', backup, 'backup.zip');

    expect(res.status).toBe(200);
    expect(await ingredientNames()).toEqual(['Lime']);

    await seedIngredient({ name: 'Basil' });
    // Reopening forces SQLite to read the file again, WAL included
    await prisma.$disconnect();
    expect(await ingredientNames()).toEqual(['Basil', 'Lime']);
    const [integrity] = await prisma.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check;');
    expect(integrity.integrity_check).toBe('ok');
  });
});
