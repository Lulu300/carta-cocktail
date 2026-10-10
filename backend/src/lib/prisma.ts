import { PrismaClient } from '@prisma/client';

/**
 * The only PrismaClient of the server process. Every route, service and test
 * helper imports it: one connection pool on the SQLite file instead of one per
 * module, which limits "database is locked" errors and lets the server
 * disconnect everything on shutdown.
 *
 * Keep all client configuration in this file (Prisma upgrades only touch it).
 * Each pooled connection already waits 5 s on a locked database (Prisma's
 * SQLite default busy timeout); `socket_timeout=<seconds>` in DATABASE_URL
 * changes it for the whole pool.
 */
export const prisma = new PrismaClient();

/**
 * Sets the SQLite journal mode and returns the mode SQLite reports.
 *
 * WAL lets readers work while a write is in progress. The mode is stored in
 * the database file, so running the pragma on one pooled connection is enough.
 * WAL does not work on network file systems (SMB, NFS): SQLITE_WAL=false
 * switches the file back to the default rollback journal.
 */
export async function configureSqlite(
  client: PrismaClient = prisma,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const requestedMode = env.SQLITE_WAL === 'false' ? 'delete' : 'wal';
  // The pragma returns a row, so it needs $queryRaw rather than $executeRaw
  const rows = await client.$queryRawUnsafe<{ journal_mode: string }[]>(
    `PRAGMA journal_mode = ${requestedMode};`,
  );
  const actualMode = rows[0].journal_mode;
  // SQLite keeps the old mode without an error when it cannot switch
  // (file system without WAL support, another connection still open)
  if (actualMode !== requestedMode) {
    console.warn(`SQLite journal mode is ${actualMode}, not ${requestedMode} as requested (SQLITE_WAL)`);
  }
  return actualMode;
}

/**
 * Copies every change still in the -wal file into the database file and
 * empties the WAL, so the .db file alone holds all the data. No effect on a
 * database in rollback journal mode.
 *
 * Temporary guard for the backup routes, until C-05 replaces it with
 * VACUUM INTO and an atomic file swap.
 */
export async function checkpointWal(client: PrismaClient = prisma): Promise<void> {
  const rows = await client.$queryRawUnsafe<{ busy: number | bigint }[]>('PRAGMA wal_checkpoint(TRUNCATE);');
  // busy = 1: a reader or writer blocked the checkpoint, so the .db file is incomplete
  if (Number(rows[0].busy) !== 0) {
    throw new Error('SQLite WAL checkpoint could not complete: the database is busy');
  }
}
