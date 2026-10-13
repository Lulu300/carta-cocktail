// Required actions of docs/releases/v1.8.0.md (and the v1.8.0 section of UPGRADING.md).
export default {
  version: '1.8.0',
  releaseNotes: 'docs/releases/v1.8.0.md',
  profile: {
    // Migration 20261010173910_schema_integrity creates the unique index Category_name_key: it
    // fails on a database with two categories of the same name (see --inject-duplicate).
    uniqueCategoryNames: true,
  },
  before: [
    {
      step: 'Before 1',
      action: 'manual',
      note: 'integrity check of the new image on a copy of the database: the real-instance fixture has no duplicates (checked in C-07); the migration refuses duplicates otherwise',
    },
    {
      step: 'Before 2',
      action: 'updateCompose',
      generation: '1.8.0',
      note: 'frontend port mapping "<port>:80" changed to "<port>:8080" (non-root nginx), own changes kept, images pinned',
    },
    { step: 'Before 3', action: 'manual', note: 'BACKEND_HOST is the backend service name on the bench: nothing to change' },
  ],
  after: [
    {
      step: 'After 1',
      action: 'manual',
      note: 'public menu and admin respond: covered by the frontend checks; a backup restore still works: not checked by the bench',
    },
  ],
  // What the notes say breaks when only the image tag changes.
  naiveMayFail: {
    frontend: 'the notes say the frontend is unreachable until the compose file maps the host port to 8080 (Before 2)',
    frontendImages: 'the notes say the frontend is unreachable until the compose file maps the host port to 8080 (Before 2)',
  },
};
