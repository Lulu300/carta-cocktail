import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import type { PrismaClient } from '../generated/prisma/client';
import { config } from '../config';
import { PRISMA_DIR, resolveDatabasePath } from '../lib/databasePath';
import { checkpointWal, configureSqlite, createPrismaClient, prisma } from '../lib/prisma';
import { BadRequestError } from '../errors';
import { hasTokenVersionColumn, writeSessionFloor } from './sessionFloor';

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
  /** Files of uploads/ that were not restored: not an image, or a name already restored. */
  skippedFiles: number;
  /**
   * The backup has an older schema: the database migrations run at startup
   * (C-01 entrypoint), which refuses schemas older than the `0_init` baseline.
   */
  restartRecommended: boolean;
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
    // Ties on finished_at (same second) fall back to the name order, which is the apply order
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1',
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

/** Inflates an entry: corrupt data (bad CRC, invalid deflate stream) is a client error. */
function readEntry(entry: AdmZip.IZipEntry): Buffer {
  try {
    return entry.getData();
  } catch {
    throw new BadRequestError('errors.invalidBackup');
  }
}

function parseMetadata(zip: AdmZip): unknown {
  const entry = zip.getEntry('metadata.json');
  if (!entry) throw new BadRequestError('errors.invalidBackup');
  try {
    return JSON.parse(readEntry(entry).toString('utf8'));
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

  const client = createPrismaClient(`file:${dbPath}`);
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

/** Highest token version of the live database: every token it issued carries this version or a lower one. */
async function highestLiveTokenVersion(): Promise<number> {
  const { _max } = await prisma.user.aggregate({ _max: { tokenVersion: true } });
  return _max.tokenVersion ?? 0;
}

/**
 * Raises the token version of every user of the restored database above both
 * its own and the live one, so that no token issued before the restore is
 * accepted after it. Otherwise the backup would bring back an older version and
 * revive the tokens revoked since (password change, "log out everywhere").
 *
 * Returns false for a backup made before the tokenVersion column existed: its
 * migration adds the column at the next start, and the session floor raises it then.
 */
async function raiseRestoredTokenVersion(restoredDbPath: string, liveTokenVersion: number): Promise<boolean> {
  const client = createPrismaClient(`file:${restoredDbPath}`);
  try {
    if (!(await hasTokenVersionColumn(client))) return false;
    await client.$executeRaw`UPDATE "User" SET "tokenVersion" = MAX("tokenVersion", ${liveTokenVersion}) + 1`;
    return true;
  } finally {
    await client.$disconnect();
  }
}

/**
 * Extracts the image files of uploads/ to a flat folder; returns how many were
 * skipped. Two entries with the same name in different sub-folders would
 * overwrite each other once flattened: the first one is kept, the others skipped.
 */
function extractUploads(zip: AdmZip, targetDir: string): number {
  const writtenNames = new Set<string>();
  let skippedFiles = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith('uploads/')) continue;
    // basename: an entry named uploads/../../x cannot leave the target folder
    const fileName = path.basename(entry.entryName);
    const isImage = RESTORABLE_UPLOAD_EXTENSIONS.has(path.extname(fileName).toLowerCase());
    if (!isImage || writtenNames.has(fileName)) {
      skippedFiles++;
      continue;
    }
    fs.writeFileSync(path.join(targetDir, fileName), readEntry(entry));
    writtenNames.add(fileName);
  }
  return skippedFiles;
}

/**
 * Folders used to swap the content of the uploads folder. Both sit inside it:
 * the folder itself is a Docker mount point (EBUSY on rename), so its entries
 * are moved one by one, and a rename only stays cheap on the same volume.
 * The leading dot keeps them out of express.static (dotfiles are ignored).
 */
interface UploadsSwap {
  uploadDir: string;
  /** Restored files, extracted before the switch. */
  stagingDir: string;
  /** Previous entries, kept until the restore succeeds. */
  asideDir: string;
  /** Names moved from stagingDir to uploadDir so far. */
  movedIn: string[];
}

function moveEntries(fromDir: string, toDir: string, names: string[], onMoved?: (name: string) => void): void {
  for (const name of names) {
    fs.renameSync(path.join(fromDir, name), path.join(toDir, name));
    onMoved?.(name);
  }
}

/** Moves the previous entries aside, then the restored files in. */
function swapUploads(swap: UploadsSwap): void {
  const { uploadDir, stagingDir, asideDir } = swap;
  const ownFolders = [path.basename(stagingDir), path.basename(asideDir)];
  fs.mkdirSync(asideDir);
  const previousEntries = fs.readdirSync(uploadDir).filter((name) => !ownFolders.includes(name));
  moveEntries(uploadDir, asideDir, previousEntries);
  moveEntries(stagingDir, uploadDir, fs.readdirSync(stagingDir), (name) => swap.movedIn.push(name));
}

/** Removes the restored files and moves the previous entries back. */
function undoUploadsSwap(swap: UploadsSwap): void {
  const { uploadDir, asideDir, movedIn } = swap;
  for (const name of movedIn) fs.rmSync(path.join(uploadDir, name), { force: true });
  if (!fs.existsSync(asideDir)) return;
  moveEntries(asideDir, uploadDir, fs.readdirSync(asideDir));
  fs.rmSync(asideDir, { recursive: true, force: true });
}

/**
 * Deletes the previous upload entries after a successful restore. A failure
 * only leaves a dot folder behind: express.static does not serve it, and the
 * next restore moves it aside and deletes it with the other entries.
 */
function removePreviousUploads(asideDir: string): void {
  try {
    fs.rmSync(asideDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Backup restored, but the previous uploads could not be deleted from ${asideDir}:`, err);
  }
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
 * happens before the live files are touched. The switch itself is short, keeps
 * a copy of the replaced database in `<database folder>/backups/`, and puts the
 * previous database and uploads back if it fails. The restored database comes
 * with a raised token version (at the next start for a backup made before
 * v1.11.0): every session, the restoring one included, ends.
 */
export async function restoreBackup(zipPath: string): Promise<RestoreResult> {
  const zip = openArchive(zipPath);
  const databaseEntry = checkArchive(zip);

  const dbPath = resolveDatabasePath();
  const stamp = fileTimestamp(new Date());
  const restoredDbPath = `${dbPath}.restore-${stamp}`;
  const preRestorePath = path.join(path.dirname(dbPath), 'backups', `pre-restore-${stamp}.db`);
  const uploadsSwap: UploadsSwap = {
    uploadDir: config.uploadDir,
    stagingDir: path.join(config.uploadDir, `.restore-${stamp}`),
    asideDir: path.join(config.uploadDir, `.pre-restore-${stamp}`),
    movedIn: [],
  };

  let databaseReplaced = false;
  let result: RestoreResult;
  try {
    fs.writeFileSync(restoredDbPath, readEntry(databaseEntry));
    const schemaVersion = await validateDatabase(restoredDbPath);

    fs.mkdirSync(uploadsSwap.stagingDir, { recursive: true });
    const skippedFiles = extractUploads(zip, uploadsSwap.stagingDir);

    // Open connections would keep reading the old WAL and later checkpoint its
    // pages over the restored file: flush it and close them all first.
    await checkpointWal();
    // Read last, right before closing: a token issued earlier carries this version at most
    const liveTokenVersion = await highestLiveTokenVersion();
    await prisma.$disconnect();
    if (!(await raiseRestoredTokenVersion(restoredDbPath, liveTokenVersion))) {
      // Kept even if the restore fails below: a floor applied over the previous
      // database only signs the admin out once more, while removing it could
      // leave a restored file without the column live and its sessions open.
      writeSessionFloor(dbPath, liveTokenVersion);
    }
    fs.mkdirSync(path.dirname(preRestorePath), { recursive: true });
    fs.copyFileSync(dbPath, preRestorePath);
    removeSqliteSideFiles(dbPath);
    fs.renameSync(restoredDbPath, dbPath);
    databaseReplaced = true;

    swapUploads(uploadsSwap);
    await reconnect();

    const appSchemaVersion = latestAppMigration();
    const restartRecommended = appSchemaVersion !== null && schemaVersion !== appSchemaVersion;
    result = { skippedFiles, restartRecommended };
  } catch (err) {
    // Before the rename the live files are untouched: Prisma reconnects to the
    // database on the next query. After it, put the previous state back.
    if (databaseReplaced) {
      try {
        undoUploadsSwap(uploadsSwap);
      } finally {
        await putBackPreviousDatabase(preRestorePath, dbPath);
      }
    }
    throw err;
  } finally {
    fs.rmSync(restoredDbPath, { force: true });
    removeSqliteSideFiles(restoredDbPath);
    fs.rmSync(uploadsSwap.stagingDir, { recursive: true, force: true });
  }

  // The restore is committed once the client has reconnected: from here on, a
  // failure must not roll it back.
  removePreviousUploads(uploadsSwap.asideDir);
  return result;
}
