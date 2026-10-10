// Required actions of docs/releases/v1.6.0.md (and the v1.6.0 section of UPGRADING.md).
export default {
  version: '1.6.0',
  releaseNotes: 'docs/releases/v1.6.0.md',
  profile: {
    migrations: true,
    journalMode: 'wal',
    startupLogs: ['SQLite journal mode: wal', 'Carta Cocktail API running on port 3001'],
    // Expected on the first start of a database created by `db push` (no migration history).
    baselineLogs: [
      'Database backed up to /app/data/backups/pre-migrate-',
      'Existing database matches 0_init: marking it as applied.',
      'Migration 0_init marked as applied.',
    ],
    refusalLog: 'does not match migration 0_init',
    // Node runs as PID 1 and handles SIGTERM: `docker compose stop` exits with code 0.
    cleanShutdown: true,
  },
  before: [
    { step: 'Before 1', action: 'requireStarted', version: '1.5.0', note: 'v1.4.x and older: start v1.5.0 once first' },
    { step: 'Before 2', action: 'copyDatabase', note: 'stop the backend, copy carta_cocktail.db* out of the volume' },
    { step: 'Before 3', action: 'checkDatabaseCopy', note: 'start the new image on a second copy and read its log' },
    { step: 'Before 4', action: 'updateCompose', generation: '1.5.0', note: 'compose file unchanged since v1.5.0, images pinned' },
    { step: 'Before 5', action: 'manual', note: 'SQLITE_WAL=false only for a database on SMB/NFS: not the case on the bench' },
  ],
  after: [
    { step: 'After 1', action: 'manual', note: 'log lines and prisma migrate status: covered by the checks below' },
  ],
  // A path that skips v1.5.0 may be refused (Before 1): the bench handles it in both modes.
  naiveMayFail: {},
};
