import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { PrismaClient } from '@prisma/client';
import {
  setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, seedIngredient, seedCocktail,
  prisma, request, authHeader,
} from '../test/helpers';
import { configureSqlite } from '../lib/prisma';
import { config } from '../config';
import { latestAppMigration, resolveDatabasePath } from '../services/backupService';

const dbPath = resolveDatabasePath();
const preRestoreDir = path.join(path.dirname(dbPath), 'backups');
const isRoot = process.getuid?.() === 0;

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

function importBackup(backup: Buffer) {
  return request.post('/api/backup/import').set(authHeader()).attach('backup', backup, 'backup.zip');
}

function zipWith(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
  return zip.toBuffer();
}

/** Adds (or replaces) entries in an existing backup. */
function withEntries(backup: Buffer, files: Record<string, string>): Buffer {
  const zip = new AdmZip(backup);
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
  return zip.toBuffer();
}

/** Rewrites the uncompressed size the central directory announces for every entry. */
function withClaimedSize(backup: Buffer, size: number): Buffer {
  const patched = Buffer.from(backup);
  const centralHeader = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let offset = patched.indexOf(centralHeader); offset !== -1; offset = patched.indexOf(centralHeader, offset + 4)) {
    patched.writeUInt32LE(size, offset + 24);
  }
  return patched;
}

/** Writes a SQLite database made by `sql` and returns its bytes. */
async function sqliteFileWith(sql: string[]): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-backup-'));
  const file = path.join(dir, 'database.db');
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    for (const statement of sql) await client.$executeRawUnsafe(statement);
  } finally {
    await client.$disconnect();
  }
  const bytes = fs.readFileSync(file);
  fs.rmSync(dir, { recursive: true, force: true });
  return bytes;
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

async function cocktailNames(): Promise<string[]> {
  const cocktails = await prisma.cocktail.findMany({ orderBy: { name: 'asc' } });
  return cocktails.map((cocktail) => cocktail.name);
}

/** Marks the live database as migrated up to `migrationName`, as `prisma migrate deploy` would. */
async function recordMigration(migrationName: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS _prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL, finished_at DATETIME)',
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, migration_name, finished_at) VALUES ('${migrationName}', '${migrationName}', CURRENT_TIMESTAMP)`,
  );
}

function uploadDirContent(): string[] {
  return fs.readdirSync(config.uploadDir).sort();
}

function emptyUploadDir(): void {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  for (const entry of fs.readdirSync(config.uploadDir)) {
    fs.rmSync(path.join(config.uploadDir, entry), { recursive: true, force: true });
  }
}

function preRestoreCopies(): string[] {
  if (!fs.existsSync(preRestoreDir)) return [];
  return fs.readdirSync(preRestoreDir).filter((name) => /^pre-restore-.*\.db$/.test(name));
}

/** Temporary files a restore leaves when it does not clean up after itself. */
function restoreLeftovers(): string[] {
  const nextToDatabase = fs.readdirSync(path.dirname(dbPath)).filter((name) => name.includes('.restore-'));
  const inUploads = fs.readdirSync(config.uploadDir).filter((name) => name.startsWith('.restore-'));
  return [...nextToDatabase, ...inUploads];
}

let preRestoreCopiesBefore: string[];

beforeAll(async () => {
  await setupTestDatabase();
  expect(await configureSqlite(prisma, {})).toBe('wal');
  preRestoreCopiesBefore = preRestoreCopies();
});

afterAll(async () => {
  // Leave no -wal file behind for the next test file's database
  await configureSqlite(prisma, { SQLITE_WAL: 'false' });
  await teardownTestDatabase();
  for (const name of preRestoreCopies()) {
    if (!preRestoreCopiesBefore.includes(name)) fs.rmSync(path.join(preRestoreDir, name));
  }
  if (fs.existsSync(preRestoreDir) && fs.readdirSync(preRestoreDir).length === 0) fs.rmdirSync(preRestoreDir);
});

beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  emptyUploadDir();
});

afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS _prisma_migrations');
});

describe('backup database path', () => {
  it('should be the file Prisma really opened', async () => {
    const [main] = await prisma.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list;');

    expect(fs.realpathSync(dbPath)).toBe(fs.realpathSync(main.file));
  });
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
  it('should send a zip with the metadata, the database and the uploads', async () => {
    fs.writeFileSync(path.join(config.uploadDir, 'export-test.jpg'), 'image bytes');
    fs.mkdirSync(path.join(config.uploadDir, 'cocktails'));
    fs.writeFileSync(path.join(config.uploadDir, 'cocktails', 'nested.png'), 'nested bytes');

    const res = await requestExport();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=backup-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = new AdmZip(res.body as Buffer);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    expect(entryNames).toEqual(expect.arrayContaining([
      'metadata.json', 'database.db', 'uploads/export-test.jpg', 'uploads/cocktails/nested.png',
    ]));
    const metadata = JSON.parse(zip.getEntry('metadata.json')!.getData().toString('utf8'));
    const { version: appVersion } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(metadata).toEqual({
      version: 1, createdAt: expect.any(String), appVersion, schemaVersion: null,
    });
    expect(zip.getEntry('database.db')!.getData().subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0');
    expect(zip.getEntry('uploads/export-test.jpg')!.getData().toString('utf8')).toBe('image bytes');
  });

  it('should write the last applied migration as the schema version', async () => {
    await recordMigration('20990101000000_from_test');

    const zip = new AdmZip(await exportBackup());

    expect(JSON.parse(zip.getEntry('metadata.json')!.getData().toString('utf8')).schemaVersion)
      .toBe('20990101000000_from_test');
  });

  it('should delete the database snapshot once the download is over', async () => {
    const snapshots = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('carta-snapshot-'));
    const before = snapshots();

    await exportBackup();

    expect(snapshots()).toEqual(before);
  });

  it.skipIf(isRoot)('should cut the download instead of sending a truncated zip when a file cannot be read', async () => {
    const unreadable = path.join(config.uploadDir, 'unreadable.jpg');
    fs.writeFileSync(unreadable, 'image bytes');
    fs.chmodSync(unreadable, 0o000);

    try {
      await expect(requestExport()).rejects.toThrow();
    } finally {
      fs.chmodSync(unreadable, 0o644);
    }
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

    const res = await importBackup(backup);

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

describe('backup restore', () => {
  it('should bring back deleted data and answer without a restart', async () => {
    const cocktail = await seedCocktail({ name: 'Mojito' });
    const backup = await exportBackup();
    await prisma.cocktail.delete({ where: { id: cocktail.id } });
    const copiesBefore = preRestoreCopies();

    const res = await importBackup(backup);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Backup restored successfully', skippedFiles: 0, restartRecommended: true });
    expect(await cocktailNames()).toEqual(['Mojito']);
    const list = await request.get('/api/cocktails').set(authHeader());
    expect(list.status).toBe(200);
    expect(preRestoreCopies().length).toBe(copiesBefore.length + 1);
    expect(restoreLeftovers()).toEqual([]);
  });

  it('should keep a copy of the replaced database', async () => {
    const backup = await exportBackup();
    await seedCocktail({ name: 'Replaced' });
    const copiesBefore = preRestoreCopies();

    await importBackup(backup);

    const [copy] = preRestoreCopies().filter((name) => !copiesBefore.includes(name));
    const client = new PrismaClient({ datasourceUrl: `file:${path.join(preRestoreDir, copy)}` });
    try {
      expect((await client.cocktail.findMany()).map((c) => c.name)).toEqual(['Replaced']);
    } finally {
      await client.$disconnect();
    }
  });

  it('should restore only image files, flattened, and count the others', async () => {
    const backup = withEntries(await exportBackup(), {
      'uploads/sub/a.png': 'png bytes',
      'uploads/evil.html': '<script>alert(1)</script>',
      'uploads/ok.webp': 'webp bytes',
      'uploads/PHOTO.JPG': 'jpg bytes',
    });
    fs.writeFileSync(path.join(config.uploadDir, 'old.jpg'), 'old bytes');

    const res = await importBackup(backup);

    expect(res.status).toBe(200);
    expect(res.body.skippedFiles).toBe(1);
    expect(uploadDirContent()).toEqual(['PHOTO.JPG', 'a.png', 'ok.webp']);
    expect(fs.readFileSync(path.join(config.uploadDir, 'a.png'), 'utf8')).toBe('png bytes');
  });

  it('should replace an uploads folder that contains a sub-folder', async () => {
    const backup = withEntries(await exportBackup(), { 'uploads/restored.jpg': 'jpg bytes' });
    fs.mkdirSync(path.join(config.uploadDir, 'cocktails'));
    fs.writeFileSync(path.join(config.uploadDir, 'cocktails', 'old.jpg'), 'old bytes');

    const res = await importBackup(backup);

    expect(res.status).toBe(200);
    expect(uploadDirContent()).toEqual(['restored.jpg']);
  });

  it('should not recommend a restart when the backup has the current schema', async () => {
    await recordMigration(latestAppMigration()!);
    const backup = await exportBackup();

    const res = await importBackup(backup);

    expect(res.status).toBe(200);
    expect(res.body.restartRecommended).toBe(false);
  });

  it.skipIf(isRoot)('should put the previous database back when the switch fails after the rename', async () => {
    const backup = await exportBackup();
    await seedCocktail({ name: 'Kept' });
    // A file the restore cannot delete makes the uploads swap fail
    const locked = path.join(config.uploadDir, 'locked');
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, 'photo.jpg'), 'bytes');
    fs.chmodSync(locked, 0o555);

    try {
      const res = await importBackup(backup);

      expect(res.status).toBe(500);
      expect(await cocktailNames()).toEqual(['Kept']);
      expect((await request.get('/api/cocktails').set(authHeader())).status).toBe(200);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });
});

describe('backup import validation', () => {
  const validMetadata = JSON.stringify({ version: 1 });

  it('should answer 400 JSON without a file', async () => {
    const res = await request.post('/api/backup/import').set(authHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it.each([
    ['that is not a zip', async () => Buffer.from('not a zip archive')],
    ['without metadata.json', async () => zipWith({ 'database.db': 'x' })],
    ['with an unreadable metadata.json', async () => zipWith({ 'metadata.json': '{not json', 'database.db': 'x' })],
    ['with a null metadata.json', async () => zipWith({ 'metadata.json': 'null', 'database.db': 'x' })],
    ['without database.db', async () => zipWith({ 'metadata.json': validMetadata })],
    ['with an unsupported metadata version', async () => zipWith({ 'metadata.json': '{"version":2}', 'database.db': 'x' })],
    ['whose database.db is plain text', async () => zipWith({ 'metadata.json': validMetadata, 'database.db': 'plain text' })],
    ['whose database.db only has a SQLite header', async () => zipWith({
      'metadata.json': validMetadata,
      'database.db': Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(200, 7)]),
    })],
    ['whose database misses the application tables', async () => zipWith({
      'metadata.json': validMetadata,
      'database.db': await sqliteFileWith(['CREATE TABLE Other (id INTEGER)']),
    })],
    ['with more than 5000 entries', async () => {
      const files: Record<string, string> = { 'metadata.json': validMetadata, 'database.db': 'x' };
      for (let i = 0; i < 5000; i++) files[`uploads/${i}.jpg`] = '';
      return zipWith(files);
    }],
    ['announcing more than 500 MB once extracted', async () => withClaimedSize(
      zipWith({ 'metadata.json': validMetadata, 'database.db': 'x' }), 501 * 1024 * 1024,
    )],
  ])('should answer 400 and keep the data for a backup %s', async (_label, buildBackup) => {
    const backup = await buildBackup();
    await seedCocktail({ name: 'Mojito' });
    fs.writeFileSync(path.join(config.uploadDir, 'kept.jpg'), 'kept bytes');

    const res = await importBackup(backup);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid backup file');
    expect(await cocktailNames()).toEqual(['Mojito']);
    expect(uploadDirContent()).toEqual(['kept.jpg']);
    expect(restoreLeftovers()).toEqual([]);
  });

  it('should answer 400 for a backup made by a newer version of the application', async () => {
    await recordMigration('99999999999999_future');
    const backup = await exportBackup();
    await prisma.$executeRawUnsafe('DROP TABLE _prisma_migrations');
    await seedCocktail({ name: 'Mojito' });

    const res = await importBackup(backup);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/newer version/);
    expect(await cocktailNames()).toEqual(['Mojito']);
  });
});
