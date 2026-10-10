import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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
import { config } from '../config';

// Export and import tests written before the adm-zip 0.6 / archiver 8 upgrade (B-07),
// plus the regression tests for the WAL guard (C-02). C-05 rewrites the backup
// routes and extends these tests.

const originalDatabaseUrl = process.env.DATABASE_URL;

/** Downloads a backup, keeping the zip as a Buffer instead of letting supertest parse it. */
function requestExport() {
  return request
    .get('/api/backup/export')
    .set(authHeader())
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

async function exportBackup(): Promise<Buffer> {
  const res = await requestExport();
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

describe('backup authentication', () => {
  it.each([
    ['GET', '/api/backup/export'],
    ['POST', '/api/backup/import'],
  ])('should answer 401 to %s %s without a token', async (method, url) => {
    const res = method === 'GET' ? await request.get(url) : await request.post(url);
    expect(res.status).toBe(401);
  });
});

describe('backup export', () => {
  const uploadedImage = path.join(config.uploadDir, 'export-test.jpg');

  afterEach(() => {
    fs.rmSync(uploadedImage, { force: true });
  });

  it('should send a zip with the metadata, the database and the uploads', async () => {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(uploadedImage, 'image bytes');

    const res = await requestExport();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=backup-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = new AdmZip(res.body as Buffer);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    expect(entryNames).toEqual(expect.arrayContaining(['metadata.json', 'database.db', 'uploads/export-test.jpg']));
    expect(JSON.parse(zip.getEntry('metadata.json')!.getData().toString('utf8'))).toMatchObject({ version: 1 });
    expect(zip.getEntry('database.db')!.getData().subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0');
    expect(zip.getEntry('uploads/export-test.jpg')!.getData().toString('utf8')).toBe('image bytes');
  });
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

describe('backup import validation', () => {
  function zipWith(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return zip.toBuffer();
  }

  it('should answer 400 JSON without a file', async () => {
    const res = await request.post('/api/backup/import').set(authHeader());
    expect(res.status).toBe(400);
  });

  it.each([
    ['that is not a zip', Buffer.from('not a zip archive')],
    ['without metadata.json', zipWith({ 'database.db': 'x' })],
    ['without database.db', zipWith({ 'metadata.json': '{"version":1}' })],
    ['with an unsupported metadata version', zipWith({ 'metadata.json': '{"version":2}', 'database.db': 'x' })],
  ])('should answer 400 and keep the data for a backup %s', async (_label, backup) => {
    await seedIngredient({ name: 'Lime' });

    const res = await request.post('/api/backup/import').set(authHeader())
      .attach('backup', backup, 'backup.zip');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid backup file');
    expect(await ingredientNames()).toEqual(['Lime']);
  });
});
