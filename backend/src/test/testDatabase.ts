import fs from 'fs';
import path from 'path';

// Prisma resolves a relative SQLite path from the folder of schema.prisma,
// not from the working directory: this URL names backend/prisma/test.db.
export const TEST_DATABASE_URL = 'file:./test.db';
export const TEST_DATABASE_PATH = path.resolve(__dirname, '../../prisma/test.db');

/** Deletes the test database and the journal files SQLite keeps next to it. */
export function removeTestDatabaseFiles(): void {
  for (const suffix of ['', '-wal', '-journal', '-shm']) {
    fs.rmSync(TEST_DATABASE_PATH + suffix, { force: true });
  }
}
