// Required actions of docs/releases/v1.12.0.md (and the v1.12.0 section of UPGRADING.md).
import { FAILED_MIGRATION_REFUSAL } from '../lib/checks.mjs';

export default {
  version: '1.12.0',
  releaseNotes: 'docs/releases/v1.12.0.md',
  // D-01: the backend runs as the node user (uid 1000), with the same startup log lines as v1.11.0.
  // C-18: a migration that fails (duplicates, for example) stops the backend with its own message.
  profile: {
    refusals: [FAILED_MIGRATION_REFUSAL],
  },
  before: [
    { step: 'Before 1', action: 'manual', note: 'stop the backend: the bench stopped it after the checks of the previous step' },
    { step: 'Before 2', action: 'copyDatabase', note: 'back up the database before the first start of the non-root image (the photos stay in place)' },
    {
      step: 'Before 3',
      action: 'chownMounts',
      destinations: ['/app/data', '/app/uploads'],
      owner: '1000:1000',
      note: 'give the volumes or host folders mounted on /app/data and /app/uploads to the node user (alpine container)',
    },
    {
      step: 'Before 4',
      action: 'manual',
      note: 'integrity check with the new command: only asked by the v1.8.0 notes, whose hook marks it manual (no duplicates in the fixture)',
    },
    {
      step: 'Before 5',
      action: 'manual',
      note: 'port 3001 no longer published: the bench calls the backend directly, so its templates keep it on 127.0.0.1, as the loopback override of the notes',
    },
    {
      step: 'Before 6',
      action: 'updateCompose',
      generation: '1.8.0',
      note: 'new compose file (healthchecks, no backend port, user ${CARTA_UID:-1000}:${CARTA_GID:-1000}): not in the templates, which keep the 1.8.0 generation; the default user is the uid of USER node; own changes kept, images pinned',
    },
  ],
  after: [
    { step: 'After 1-2', action: 'manual', note: 'API running line and node processes: covered by the startup checks' },
    { step: 'After 3-6', action: 'manual', note: 'both services healthy, /api/health: the templates have no healthcheck' },
    { step: 'After 7', action: 'manual', note: 'SQLITE_WAL=false only for a database on SMB/NFS: not the case on the bench' },
    { step: 'After 8', action: 'manual', note: 'Aperitifs and Digestifs menus: run the two counts of C-06 (personal bottle menus, empty checked bottles that Synchronize will add) on the fixture copy' },
  ],
  // What the notes say breaks when only the image tag changes.
  naiveMayFail: {
    startup: 'the notes say the backend stops at startup until the data folders belong to uid 1000 (Before 3), '
      + 'or when a migration fails on duplicates (v1.8.0 Before 1)',
    refusal: 'the refusal is the "cannot write" message of the entrypoint, which is not a known refusal',
    backup: 'the "cannot write" refusal stops the backend before the pre-migrate backup',
  },
};
