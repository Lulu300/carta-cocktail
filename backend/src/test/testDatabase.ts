import fs from 'fs';
import path from 'path';
import { resolveDatabasePath } from '../lib/databasePath';

// Prisma resolves a relative SQLite path from the folder of schema.prisma,
// not from the working directory: this URL names backend/prisma/test/test.db.
// The folder holds nothing else, so that the files a restore writes next to the
// database (backups/pre-restore-*.db, *.restore-*) never mix with the copies of
// the developer's own database in backend/prisma/backups/.
export const TEST_DATABASE_URL = 'file:./test/test.db';
export const TEST_DATABASE_PATH = resolveDatabasePath(TEST_DATABASE_URL);
export const TEST_DATABASE_DIR = path.dirname(TEST_DATABASE_PATH);

/** Deletes the test database folder with everything in it: database, journals, backups/. */
export function removeTestDatabaseDir(): void {
  fs.rmSync(TEST_DATABASE_DIR, { recursive: true, force: true });
}

/** Starts from an empty folder, whatever an interrupted run left in it. */
export function createEmptyTestDatabaseDir(): void {
  removeTestDatabaseDir();
  fs.mkdirSync(TEST_DATABASE_DIR, { recursive: true });
}
