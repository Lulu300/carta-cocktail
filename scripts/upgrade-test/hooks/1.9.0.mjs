// Required actions of docs/releases/v1.9.0.md (and the v1.9.0 section of UPGRADING.md).
export default {
  version: '1.9.0',
  releaseNotes: 'docs/releases/v1.9.0.md',
  // Same startup behaviour as v1.8.0; the new [uploads] warnings are extra log lines, not checks.
  profile: {},
  before: [
    { step: 'Pin', action: 'updateCompose', generation: '1.8.0', note: 'compose file unchanged since v1.8.0, own changes kept, images pinned' },
  ],
  after: [],
  naiveMayFail: {},
};
