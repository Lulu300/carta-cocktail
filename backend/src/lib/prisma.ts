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
  const requestedMode = env.SQLITE_WAL === 'false' ? 'DELETE' : 'WAL';
  // The pragma returns a row, so it needs $queryRaw rather than $executeRaw
  const rows = await client.$queryRawUnsafe<{ journal_mode: string }[]>(
    `PRAGMA journal_mode = ${requestedMode};`,
  );
  return rows[0].journal_mode;
}
