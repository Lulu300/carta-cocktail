import fs from 'fs';
import { prisma } from '../lib/prisma';

/**
 * Session floor: keeps the revocation of a restore across the restart.
 *
 * A backup made before v1.11.0 has no User.tokenVersion column, so the restore
 * cannot raise it. The migration adds the column at the next start, at 0: the
 * tokens of version 0 and up issued before the restore would work again as the
 * version climbs back (password change, "log out everywhere"). The restore
 * writes the highest live version to this file instead, and the next start
 * raises every user above it, once the migrations have run.
 */

/** Next to the database, on the same volume, so it survives the restart. */
export function sessionFloorPath(dbPath: string): string {
  return `${dbPath}.session-floor`;
}

/** Written to a temporary name, then renamed: a crash never leaves half a file. */
export function writeSessionFloor(dbPath: string, tokenVersion: number): void {
  const floorPath = sessionFloorPath(dbPath);
  fs.writeFileSync(`${floorPath}.tmp`, `${tokenVersion}\n`);
  fs.renameSync(`${floorPath}.tmp`, floorPath);
}

/** Removes the floor of a restore that did not go through, temporary file included. */
export function removeSessionFloor(dbPath: string): void {
  const floorPath = sessionFloorPath(dbPath);
  fs.rmSync(floorPath, { force: true });
  fs.rmSync(`${floorPath}.tmp`, { force: true });
}

function readSessionFloor(floorPath: string): number {
  let content: string;
  try {
    content = fs.readFileSync(floorPath, 'utf8').trim();
  } catch (err) {
    throw unreadableFloorError(floorPath, String(err));
  }
  const tokenVersion = Number(content);
  if (content === '' || !Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw unreadableFloorError(floorPath, `unexpected content "${content.slice(0, 40)}"`);
  }
  return tokenVersion;
}

// Starting without the floor would silently accept tokens revoked before the
// restore, and no other value is known to be high enough: refuse to start and
// say how to revoke every token instead.
function unreadableFloorError(floorPath: string, reason: string): Error {
  return new Error(
    `Cannot read ${floorPath} (${reason}). A backup made before v1.11.0 was restored: this file holds the `
    + 'token version that keeps the sessions opened before the restore revoked. To start anyway, change '
    + 'JWT_SECRET (this revokes every token), then delete the file and restart.',
  );
}

/**
 * Applies the floor left by a restore, if any, then deletes the file. Runs at
 * startup, before the server listens. A file applied twice (crash before the
 * deletion) only signs the admin out once more.
 */
export async function applySessionFloor(dbPath: string): Promise<void> {
  const floorPath = sessionFloorPath(dbPath);
  if (!fs.existsSync(floorPath)) return;

  const floor = readSessionFloor(floorPath);
  await prisma.$executeRaw`UPDATE "User" SET "tokenVersion" = MAX("tokenVersion", ${floor}) + 1`;
  try {
    fs.rmSync(floorPath);
  } catch (err) {
    console.warn(`Sessions revoked, but ${floorPath} could not be deleted: each start will sign the admin out again.`, err);
  }
  console.log('Sessions opened before the last backup restore revoked: sign in again.');
}
