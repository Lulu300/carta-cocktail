// Reads and prepares the SQLite database through the helper image, so that bind mounts and
// named volumes are handled the same way. Only counts and statuses leave this module, plus the
// photo file names (timestamps, no personal data).
import fs from 'node:fs';
import path from 'node:path';
import { runHelper } from './docker.mjs';

export const DB_FILE_NAME = 'carta_cocktail.db';

// Reads a copy of the database files, from a read-only mount: opening the live database would
// checkpoint its WAL and change the state handed to the next version. The fingerprint and the
// backups are read from the original folder.
const SNAPSHOT_SCRIPT = `
set -e
mkdir /tmp/snapshot
cp /data/${DB_FILE_NAME}* /tmp/snapshot/
DB=/tmp/snapshot/${DB_FILE_NAME}
echo "fingerprint|$(sha256sum /data/${DB_FILE_NAME} | cut -d' ' -f1)"
echo "backups|$(ls /data/backups/pre-migrate-*.db 2>/dev/null | wc -l)"
echo "integrity|$(sqlite3 "$DB" 'PRAGMA integrity_check;' | tr '\\n' ' ')"
echo "journal|$(sqlite3 "$DB" 'PRAGMA journal_mode;')"
for table in $(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"); do
  echo "count|$table|$(sqlite3 "$DB" "SELECT COUNT(*) FROM \\"$table\\";")"
done
sqlite3 "$DB" "SELECT DISTINCT 'image|' || imagePath FROM Cocktail WHERE imagePath IS NOT NULL AND imagePath <> '' ORDER BY imagePath;"
`;

export function parseSnapshot(output) {
  const snapshot = { counts: {}, imagePaths: [] };
  for (const line of output.split('\n')) {
    const [kind, ...values] = line.split('|');
    if (kind === 'fingerprint') snapshot.fingerprint = values[0];
    if (kind === 'backups') snapshot.backups = Number(values[0].trim());
    if (kind === 'integrity') snapshot.integrity = values[0].trim();
    if (kind === 'journal') snapshot.journalMode = values[0].trim();
    if (kind === 'count') snapshot.counts[values[0]] = Number(values[1]);
    if (kind === 'image') snapshot.imagePaths.push(values.join('|'));
  }
  return snapshot;
}

/** Counts, integrity, journal mode and backups of the database in `dataMount` (a `-v` source). */
export function takeSnapshot(dataMount) {
  return parseSnapshot(runHelper([`${dataMount}:/data:ro`], SNAPSHOT_SCRIPT));
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Copies the fixture database into `dataDir` with the admin credentials replaced: the bench
 * never needs the real password, and the real email never reaches a log or a report. The copy
 * gets its final name only once anonymized, and freed pages are wiped (secure_delete, VACUUM)
 * so that the old values do not stay in the file. Returns the number of users.
 */
export function createAnonymizedCopy(fixtureDir, dataDir, { email, passwordHash }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const pendingName = `${DB_FILE_NAME}.anonymizing`;
  fs.copyFileSync(path.join(fixtureDir, DB_FILE_NAME), path.join(dataDir, pendingName));
  const sqlDir = fs.mkdtempSync(path.join(path.dirname(dataDir), 'sql-'));
  const sql = [
    'PRAGMA secure_delete = ON;',
    `UPDATE "User" SET email = 'user' || id || '@example.test', passwordHash = ${sqlString(passwordHash)};`,
    `UPDATE "User" SET email = ${sqlString(email)} WHERE id = (SELECT MIN(id) FROM "User");`,
    'VACUUM;',
    'SELECT COUNT(*) FROM "User";',
  ].join('\n');
  fs.writeFileSync(path.join(sqlDir, 'credentials.sql'), sql);
  try {
    const output = runHelper([`${dataDir}:/data`, `${sqlDir}:/sql:ro`], `sqlite3 /data/${pendingName} < /sql/credentials.sql`);
    fs.renameSync(path.join(dataDir, pendingName), path.join(dataDir, DB_FILE_NAME));
    // The PRAGMA prints its new value first: the user count is the last line.
    return Number(output.trim().split('\n').at(-1));
  } finally {
    fs.rmSync(sqlDir, { recursive: true, force: true });
  }
}

/** Copies every database file (carta_cocktail.db*) from `dataMount` to the host folder `outDir`. */
export function copyDatabaseFiles(dataMount, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const output = runHelper(
    [`${dataMount}:/data:ro`, `${outDir}:/out`],
    `cp /data/${DB_FILE_NAME}* /out/ && ls /out | wc -l`,
  );
  return Number(output.trim());
}

/** Copies a host folder into a named volume (used to seed the official layout). */
export function fillVolume(volume, sourceDir) {
  runHelper([`${volume}:/data`, `${sourceDir}:/src:ro`], 'cp -a /src/. /data/');
}
