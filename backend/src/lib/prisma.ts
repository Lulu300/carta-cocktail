import path from 'path';
import dotenv from 'dotenv';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { resolveDatabasePath } from './databasePath';

// Prisma 7 no longer reads .env: load backend/.env before DATABASE_URL is read
// below, whatever the import order of the entry point (server, seed, scripts).
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/** Client options this module leaves to the caller: the adapter is always the SQLite one. */
export type SqliteClientOptions = Omit<Prisma.PrismaClientOptionsWithAdapter, 'adapter'>;

/**
 * Opens a PrismaClient on the SQLite file named by a `file:` URL (DATABASE_URL by
 * default). Every client of the application comes from here: the shared one
 * below, and the throwaway ones the backup restore opens on another file.
 *
 * - The driver adapter opens a relative path from the working directory, so it
 *   gets the absolute path of resolveDatabasePath().
 * - Prisma 6 stored DateTime columns as Unix milliseconds; the adapter writes
 *   ISO strings by default. Keeping milliseconds keeps every row of a column in
 *   one format, so existing databases still sort and compare dates correctly.
 * - better-sqlite3 waits 5 s on a locked database (its `timeout` option) on its
 *   single connection. URL parameters are ignored.
 */
export function createPrismaClient<Options extends SqliteClientOptions = SqliteClientOptions>(
  databaseUrl: string = process.env.DATABASE_URL ?? '',
  options?: Options,
) {
  const adapter = new PrismaBetterSqlite3(
    { url: resolveDatabasePath(databaseUrl) },
    { timestampFormat: 'unixepoch-ms' },
  );
  type ClientOptions = Options & { adapter: PrismaBetterSqlite3 };
  return new PrismaClient<ClientOptions>({ ...options, adapter } as Prisma.PrismaClientConstructorArgs<ClientOptions>);
}

/**
 * The only PrismaClient of the server process. Every route, service and test
 * helper imports it: one SQLite connection instead of one per module, which
 * limits "database is locked" errors and lets the server disconnect everything
 * on shutdown.
 *
 * Keep all client configuration in this file (Prisma upgrades only touch it).
 */
export const prisma = createPrismaClient();

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
 * The backup restore runs it before replacing the database file, so that no
 * pending WAL page can be written over the restored file.
 */
export async function checkpointWal(client: PrismaClient = prisma): Promise<void> {
  const rows = await client.$queryRawUnsafe<{ busy: number | bigint }[]>('PRAGMA wal_checkpoint(TRUNCATE);');
  // busy = 1: a reader or writer blocked the checkpoint, so the .db file is incomplete
  if (Number(rows[0].busy) !== 0) {
    throw new Error('SQLite WAL checkpoint could not complete: the database is busy');
  }
}
