// Required actions of docs/releases/v1.7.0.md (and the v1.7.0 section of UPGRADING.md).
export default {
  version: '1.7.0',
  releaseNotes: 'docs/releases/v1.7.0.md',
  // Same behaviour as v1.6.0 (migrations, WAL, clean shutdown): the profile is inherited.
  profile: {},
  before: [
    { step: 'Before 1', action: 'manual', note: '32-bit ARM hosts only: v1.7.0 does not run there (stay on v1.6.0 or move to 64-bit); the bench runs on amd64 or arm64' },
    { step: 'Pin', action: 'updateCompose', generation: '1.5.0', note: 'compose file unchanged since v1.5.0, own changes kept, images pinned' },
  ],
  after: [],
  naiveMayFail: {},
};
