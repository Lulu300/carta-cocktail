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
    { step: 'Before 1', action: 'rescueUploads', from: '/uploads', note: 'copy the photos out of the old container' },
    { step: 'Before 2', action: 'ensureJwtSecret', note: 'JWT_SECRET of 32+ characters, not a published value' },
    { step: 'Before 3', action: 'updateCompose', generation: '1.5.0', note: 'compose file of v1.5.0, own changes kept, images pinned' },
  ],
  after: [
    { step: 'After 1', action: 'restoreUploads', to: '/app/uploads', note: 'copy the rescued photos into the uploads folder' },
    { step: 'After 2', action: 'checkDefaultAdminPassword', note: 'change the admin password if it is still admin123' },
    { step: 'After 3', action: 'manual', note: 'assign the cocktails to their menu sections again (not checked by the bench)' },
  ],
  // What the notes say breaks when only the image tag changes.
  naiveMayFail: {
    images: 'the notes say photos are lost without Before 1 / After 1',
    uploadsPersistent: 'the notes say photos are lost without Before 1 / After 1',
    startup: 'the notes say the backend refuses to start without a strong JWT_SECRET (Before 2)',
  },
};
