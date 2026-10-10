// v1.4.0: starting point of the bench (no release notes, no required action).
export default {
  version: '1.4.0',
  releaseNotes: null,
  // Index digest of the image the reference instance ran. The bench uses the :1.4.0 tag only
  // if it still points to this digest.
  backendDigest: 'sha256:644cd6ca20767ae2fa316c92eaac3d97870572d27c5eebab68e9a81692948d3a',
  profile: {
    // config.ts resolved the upload folder from dist/, so the backend used /uploads.
    uploadDir: '/uploads',
    migrations: false,
    journalMode: 'delete',
    // The seed rewrote the admin email and password from ADMIN_EMAIL / ADMIN_PASSWORD at each start.
    seedResetsAdmin: true,
    startupLogs: ['Carta Cocktail API running on port 3001'],
    knownIssues: {
      uploadsPersistent: 'known v1.4.0 bug: photos written outside the uploads volume (fixed in v1.5.0, #28)',
    },
  },
  before: [],
  after: [],
  naiveMayFail: {},
};
