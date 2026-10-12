/**
 * Prints the migrations that `prisma migrate deploy` would apply to the
 * database of DATABASE_URL, and those that failed, one per line:
 * "unapplied <name>" or "failed <name>". Read-only.
 *
 * docker-entrypoint.sh runs it before the backup and after a failed deploy:
 *   node dist/scripts/migration-state.js
 *
 * Exit code: 0, or 2 when the database file is missing or cannot be read.
 */
import path from 'path';
import { PRISMA_DIR, databaseFileExists } from '../lib/databasePath';

async function main(): Promise<number> {
  if (!databaseFileExists()) {
    console.error('Database file not found: set DATABASE_URL=file:/path/to/database.db');
    return 2;
  }
  // Loaded after the check: the shared client resolves DATABASE_URL when it is imported.
  const { prisma } = await import('../lib/prisma');
  const { formatMigrationState, readMigrationState, summarizeError } = await import('../bootstrap/migrationState');
  try {
    const state = await readMigrationState(prisma, path.join(PRISMA_DIR, 'migrations'));
    console.log(formatMigrationState(state));
    return 0;
  } catch (err) {
    // One line in the startup log: the deploy that follows reports the error in full.
    console.error(`Cannot read the migration history: ${summarizeError(err)}`);
    return 2;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });
