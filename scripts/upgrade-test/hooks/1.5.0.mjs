// Required actions of docs/releases/v1.5.0.md (and the v1.5.0 section of UPGRADING.md).
export default {
  version: '1.5.0',
  releaseNotes: 'docs/releases/v1.5.0.md',
  profile: {
    uploadDir: '/app/uploads',
    seedResetsAdmin: false,
    knownIssues: {},
  },
  before: [
    { step: 'Before 1', action: 'rescueUploads', from: '/uploads', note: 'find the photos (docker inspect); copy them out only if /uploads is not a mount' },
    { step: 'Before 2', action: 'ensureJwtSecret', note: 'JWT_SECRET of 32+ characters in .env, or in the env_file that holds the secrets' },
    {
      step: 'Before 3',
      action: 'updateCompose',
      generation: '1.5.0',
      note: 'compose file of v1.5.0, own changes kept, photos mounted on /app/uploads, secrets kept in the env_file, images pinned',
    },
  ],
  after: [
    { step: 'After 1', action: 'restoreUploads', to: '/app/uploads', note: '/app/uploads is a mount, rescued photos copied into it, a photo is served' },
    { step: 'After 2', action: 'changeWeakAdminPassword', note: 'change an admin password that is admin123 or shorter than 12 characters' },
    { step: 'After 3', action: 'manual', note: 'assign the cocktails to their menu sections again (not checked by the bench)' },
  ],
  // What the notes say breaks when only the image tag changes.
  naiveMayFail: {
    images: 'the notes say photos are lost without Before 1 / After 1',
    uploadsPersistent: 'the notes say photos are lost without Before 1 / After 1',
    startup: 'the notes say the backend refuses to start without a strong JWT_SECRET (Before 2)',
  },
};
