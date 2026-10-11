import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { checkpointWal, configureSqlite, prisma } from '../lib/prisma';
import { BadRequestError } from '../errors';

/** Format of the backup archive, written to metadata.json. Every published version wrote 1. */
export const BACKUP_FORMAT_VERSION = 1;

/** Largest backup archive the import accepts (keep in line with frontend/nginx.conf.template). */
export const MAX_BACKUP_UPLOAD_BYTES = 200 * 1024 * 1024;

// adm-zip extracts each entry in memory: these bounds keep a crafted archive
// (zip bomb, millions of tiny entries) from exhausting the server.
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');
const REQUIRED_TABLES = ['User', 'Cocktail', 'Bottle', 'Menu'];
// The image types the cocktail upload accepts. Anything else in uploads/ would be
// served from the admin's origin (an .html or .js file), so it is never restored.
const RESTORABLE_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Folder of schema.prisma: Prisma resolves relative SQLite paths from there.
// Same folder from src/services and dist/services.
const PRISMA_DIR = path.resolve(__dirname, '../../prisma');
const MIGRATIONS_DIR = path.join(PRISMA_DIR, 'migrations');
const PACKAGE_JSON = path.resolve(__dirname, '../../package.json');

const SQLITE_SIDE_FILE_SUFFIXES = ['-wal', '-shm', '-journal'];

export interface BackupMetadata {
  version: number;
  createdAt: string;
  appVersion: string;
  schemaVersion: string | null;
}

export interface RestoreResult {
  /** Files of uploads/ that were not restored because their type is not an image. */
  skippedFiles: number;
  /** The backup has an older schema: a restart applies the missing migrations. */
  restartRecommended: boolean;
}

/**
 * Path of the SQLite file named by a `file:` DATABASE_URL, as Prisma opens it:
 * URL parameters removed, relative paths resolved from the folder of schema.prisma
 * (not from the working directory).
 */
export function resolveDatabasePath(url: string = process.env.DATABASE_URL ?? ''): string {
  if (!url.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file: URL');
  }
  const filePath = url.slice('file:'.length).split('?')[0];
  return path.resolve(PRISMA_DIR, filePath);
}

/**
 * Writes a consistent copy of the live database to a temporary file and returns
 * its path. VACUUM INTO reads one transaction snapshot, WAL content included,
 * so writes made during the export never end up half copied.
 */
export async function createSnapshot(client: PrismaClient = prisma): Promise<string> {
  const snapshotPath = path.join(os.tmpdir(), `carta-snapshot-${randomUUID()}.db`);
  const quotedPath = snapshotPath.replace(/'/g, "''");
  await client.$executeRawUnsafe(`VACUUM INTO '${quotedPath}'`);
  return snapshotPath;
}

async function listTables(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  return rows.map((row) => row.name);
}

/**
 * Last Prisma migration applied to a database, or null when it has none
 * (database created before migrations, or by `prisma db push`).
 */
export async function readSchemaVersion(client: PrismaClient): Promise<string | null> {
  const tables = await listTables(client);
  if (!tables.includes('_prisma_migrations')) return null;
  const rows = await client.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1',
  );
  return rows[0]?.migration_name ?? null;
}

/**
 * Newest migration shipped with this version of the application. Migration
 * folders are named `<timestamp>_<name>` (plus the `0_init` baseline), so the
 * alphabetical order is the order in which they apply.
 */
export function latestAppMigration(migrationsDir: string = MIGRATIONS_DIR): string | null {
  if (!fs.existsSync(migrationsDir)) return null;
  const migrations = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return migrations[migrations.length - 1] ?? null;
}

function readAppVersion(): string {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')).version;
}

export async function buildMetadata(client: PrismaClient = prisma): Promise<BackupMetadata> {
  return {
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: readAppVersion(),
    schemaVersion: await readSchemaVersion(client),
  };
}

function openArchive(zipPath: string): AdmZip {
  try {
    return new AdmZip(zipPath);
  } catch {
    throw new BadRequestError('errors.invalidBackup');
  }
}

function parseMetadata(zip: AdmZip): unknown {
  const entry = zip.getEntry('metadata.json');
  if (!entry) throw new BadRequestError('errors.invalidBackup');
  try {
    return JSON.parse(entry.getData().toString('utf8'));
  } catch {
    throw new BadRequestError('errors.invalidBackup');
  }
}

/** Rejects archives that are not a Carta Cocktail backup, or too big to extract safely. */
function checkArchive(zip: AdmZip): AdmZip.IZipEntry {
  const entries = zip.getEntries();
  const uncompressedBytes = entries.reduce((total, entry) => total + entry.header.size, 0);
  if (entries.length > MAX_ENTRIES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new BadRequestError('errors.invalidBackup');
  }
  const metadata = parseMetadata(zip);
  const version = (metadata as { version?: unknown } | null)?.version;
  if (version !== BACKUP_FORMAT_VERSION) throw new BadRequestError('errors.invalidBackup');

  const databaseEntry = zip.getEntry('database.db');
  if (!databaseEntry) throw new BadRequestError('errors.invalidBackup');
  return databaseEntry;
}

function hasSqliteHeader(filePath: string): boolean {
  const header = Buffer.alloc(SQLITE_HEADER.length);
  const fd = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    return bytesRead === header.length && header.equals(SQLITE_HEADER);
  } finally {
    fs.closeSync(fd);
  }
}

function removeSqliteSideFiles(dbPath: string): void {
  for (const suffix of SQLITE_SIDE_FILE_SUFFIXES) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}

/**
 * Checks that the extracted file is a sound Carta Cocktail database this version
 * can run, and returns its schema version.
 */
async function validateDatabase(dbPath: string): Promise<string | null> {
  if (!hasSqliteHeader(dbPath)) throw new BadRequestError('errors.invalidBackup');

  const client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  try {
    const [integrity] = await client.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check;');
    if (integrity?.integrity_check !== 'ok') throw new BadRequestError('errors.invalidBackup');

    const tables = await listTables(client);
    if (!REQUIRED_TABLES.every((table) => tables.includes(table))) {
      throw new BadRequestError('errors.invalidBackup');
    }

    const schemaVersion = await readSchemaVersion(client);
    const appSchemaVersion = latestAppMigration();
    if (schemaVersion && appSchemaVersion && schemaVersion > appSchemaVersion) {
      throw new BadRequestError('errors.backupSchemaTooNew');
    }
    return schemaVersion;
  } catch (err) {
    // A file with a valid header can still be unreadable (truncated, encrypted)
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('errors.invalidBackup');
  } finally {
    await client.$disconnect();
    removeSqliteSideFiles(dbPath);
  }
}

/** Extracts the image files of uploads/ to a flat folder; returns how many were skipped. */
function extractUploads(zip: AdmZip, targetDir: string): number {
  let skippedFiles = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith('uploads/')) continue;
    // basename: an entry named uploads/../../x cannot leave the target folder
    const fileName = path.basename(entry.entryName);
    if (!RESTORABLE_UPLOAD_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
      skippedFiles++;
      continue;
    }
    fs.writeFileSync(path.join(targetDir, fileName), entry.getData());
  }
  return skippedFiles;
}

/**
 * Replaces the content of the uploads folder with the staged files. The folder
 * itself is a Docker mount point (EBUSY on rename), so it is emptied and the files
 * are moved one by one; the staging folder is inside it, on the same volume.
 */
function swapUploads(uploadDir: string, stagingDir: string): void {
  const stagingName = path.basename(stagingDir);
  for (const entry of fs.readdirSync(uploadDir)) {
    if (entry !== stagingName) fs.rmSync(path.join(uploadDir, entry), { recursive: true, force: true });
  }
  for (const fileName of fs.readdirSync(stagingDir)) {
    fs.renameSync(path.join(stagingDir, fileName), path.join(uploadDir, fileName));
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

/** Reopens the shared client on the database file currently in place. */
async function reconnect(): Promise<void> {
  // A request may have reopened a connection on the old file since the first
  // disconnect: close it again before opening the new file.
  await prisma.$disconnect();
  await prisma.$connect();
  await configureSqlite();
}

async function putBackPreviousDatabase(preRestorePath: string, dbPath: string): Promise<void> {
  await prisma.$disconnect();
  removeSqliteSideFiles(dbPath);
  fs.copyFileSync(preRestorePath, dbPath);
  await reconnect();
}

/** `20261011-153700123`: sortable, and readable in the backups folder. */
function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.Z]/g, '').replace('T', '-');
}

/**
 * Restores a backup archive over the live database and uploads.
 *
 * Everything that can fail on bad input (archive, database checks, extraction)
 * happens before the live files are touched. The switch itself is short and
 * keeps a copy of the replaced database in `<database folder>/backups/`.
 */
export async function restoreBackup(zipPath: string): Promise<RestoreResult> {
  const zip = openArchive(zipPath);
  const databaseEntry = checkArchive(zip);

  const dbPath = resolveDatabasePath();
  const stamp = fileTimestamp(new Date());
  const restoredDbPath = `${dbPath}.restore-${stamp}`;
  // Inside the uploads folder so the final moves stay on the same volume. The
  // dot keeps it out of express.static (dotfiles are ignored).
  const stagingDir = path.join(config.uploadDir, `.restore-${stamp}`);
  const preRestorePath = path.join(path.dirname(dbPath), 'backups', `pre-restore-${stamp}.db`);

  let databaseReplaced = false;
  try {
    fs.writeFileSync(restoredDbPath, databaseEntry.getData());
    const schemaVersion = await validateDatabase(restoredDbPath);

    fs.mkdirSync(stagingDir, { recursive: true });
    const skippedFiles = extractUploads(zip, stagingDir);

    // Open connections would keep reading the old WAL and later checkpoint its
    // pages over the restored file: flush it and close them all first.
    await checkpointWal();
    await prisma.$disconnect();
    fs.mkdirSync(path.dirname(preRestorePath), { recursive: true });
    fs.copyFileSync(dbPath, preRestorePath);
    removeSqliteSideFiles(dbPath);
    fs.renameSync(restoredDbPath, dbPath);
    databaseReplaced = true;

    swapUploads(config.uploadDir, stagingDir);
    await reconnect();

    const appSchemaVersion = latestAppMigration();
    const restartRecommended = appSchemaVersion !== null && schemaVersion !== appSchemaVersion;
    return { skippedFiles, restartRecommended };
  } catch (err) {
    // Before the rename the live database is untouched: Prisma reconnects to it on
    // the next query. After it, the restored file may be broken: put the copy back.
    if (databaseReplaced) await putBackPreviousDatabase(preRestorePath, dbPath);
    throw err;
  } finally {
    fs.rmSync(restoredDbPath, { force: true });
    removeSqliteSideFiles(restoredDbPath);
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
