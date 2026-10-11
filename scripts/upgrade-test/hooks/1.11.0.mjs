// Required actions of docs/releases/v1.11.0.md (and the v1.11.0 section of UPGRADING.md).
export default {
  version: '1.11.0',
  releaseNotes: 'docs/releases/v1.11.0.md',
  // Same startup behaviour as v1.10.0: the user_token_version migration is checked by
  // `prisma migrate status` like any other, and the session floor line is only logged
  // after a backup restore, which the bench does not run.
  profile: {},
  before: [
    { step: 'Pin', action: 'updateCompose', generation: '1.8.0', note: 'compose file unchanged since v1.8.0, own changes kept, images pinned' },
  ],
  after: [],
  naiveMayFail: {},
};
