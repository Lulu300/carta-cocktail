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
    {
      step: 'Before 1',
      action: 'requireStarted',
      version: '1.5.0',
      // Same schema as v1.5.0: from v1.4.x the notes allow a direct upgrade with the v1.5.0 actions.
      directFrom: '1.4',
      note: 'v1.4.x: start v1.5.0 once first, or upgrade straight with the v1.5.0 actions; older: start v1.5.0 first',
    },
    { step: 'Before 2', action: 'checkPhotoMount', note: 'on v1.5.0, /app/uploads must be a mount; otherwise copy the photos out' },
    { step: 'Before 3', action: 'copyDatabase', note: 'stop the backend, copy carta_cocktail.db* out of the volume or the data folder' },
    { step: 'Before 4', action: 'checkDatabaseCopy', note: 'start the new image on a second copy and read its log' },
    { step: 'Before 5', action: 'updateCompose', generation: '1.5.0', note: 'compose file unchanged since v1.5.0, own changes kept, images pinned' },
    { step: 'Before 6', action: 'manual', note: 'SQLITE_WAL=false only for a database on SMB/NFS: not the case on the bench' },
  ],
  after: [
    { step: 'After 1', action: 'manual', note: 'log lines and prisma migrate status: covered by the checks below' },
    { step: 'After 2', action: 'restoreUploads', to: '/app/uploads', onlyIfRescued: true, note: 'only if photos were rescued in Before 2: copy them back, check a photo' },
    { step: 'After 3', action: 'manual', note: 'roll back if something goes wrong (not needed when the checks pass)' },
  ],
  // A path that skips a required start (Before 1) may be refused: the bench handles it in both modes.
  naiveMayFail: {},
};
