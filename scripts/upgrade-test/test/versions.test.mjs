import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersions, defaultLocalVersion, hooksForJump, latestHookVersion, parseUpgradePath, profileOf, releaseOf,
} from '../lib/versions.mjs';

const HOOKS = [
  { version: '1.6.0', profile: { migrations: true } },
  { version: '1.4.0', profile: { uploadDir: '/uploads', migrations: false } },
  { version: '1.5.0', profile: { uploadDir: '/app/uploads' } },
];

test('compareVersions orders pre-releases before their release', () => {
  assert.equal(compareVersions('1.6.0-rc.1', '1.6.0'), -1);
  assert.equal(compareVersions('1.6.0-rc.2', '1.6.0-rc.10'), -1);
  assert.equal(compareVersions('1.5.0', '1.4.9'), 1);
  assert.equal(compareVersions('1.5.0', '1.5.0'), 0);
});

test('releaseOf drops the pre-release part', () => {
  assert.equal(releaseOf('1.6.0-rc.1'), '1.6.0');
});

test('parseUpgradePath maps local to the given version and refuses downgrades', () => {
  const steps = parseUpgradePath('1.4.0, 1.6.0-rc.1,local', { hookFiles: HOOKS, localVersion: '1.6.0' });
  assert.deepEqual(steps.map((step) => [step.label, step.version, step.local]), [
    ['1.4.0', '1.4.0', false], ['1.6.0-rc.1', '1.6.0-rc.1', false], ['local', '1.6.0', true],
  ]);
  assert.throws(() => parseUpgradePath('1.5.0,1.4.0', { hookFiles: HOOKS }), /^Error: --path must go up: 1\.5\.0 -> 1\.4\.0$/);
  assert.throws(() => parseUpgradePath('1.5.0', { hookFiles: HOOKS }), /at least two/);
  assert.throws(() => parseUpgradePath('1.4.0,latest', { hookFiles: HOOKS }), /Invalid version/);
});

test('parseUpgradePath accepts local after the newest hook release without --local-version', () => {
  const steps = parseUpgradePath('1.4.0,1.6.0,local', { hookFiles: HOOKS });
  assert.deepEqual(steps.at(-1), { label: 'local', version: '1.7.0', local: true });
});

test('parseUpgradePath gives --local-version priority over the default', () => {
  const steps = parseUpgradePath('1.6.0,local', { hookFiles: HOOKS, localVersion: '1.6.1' });
  assert.equal(steps.at(-1).version, '1.6.1');
});

test('parseUpgradePath refuses a local step that goes down and points to --local-version', () => {
  assert.throws(
    () => parseUpgradePath('1.6.0,local', { hookFiles: HOOKS, localVersion: '1.5.0' }),
    /must go up: 1\.6\.0 -> local \("local" follows the notes of 1\.5\.0; set --local-version/,
  );
  assert.throws(
    () => parseUpgradePath('1.4.0,local,1.9.0', { hookFiles: HOOKS }),
    /must go up: local -> 1\.9\.0 .*--local-version/,
  );
});

test('defaultLocalVersion is the minor release after the newest hook file or path version', () => {
  assert.equal(defaultLocalVersion(HOOKS, ['1.4.0', '1.5.0']), '1.7.0');
  assert.equal(defaultLocalVersion(HOOKS, ['1.4.0', '1.8.2']), '1.9.0');
  assert.equal(defaultLocalVersion(HOOKS, ['1.7.0-rc.1']), '1.8.0');
});

test('a local step crosses a hook file added for a release in preparation', () => {
  const hookFiles = [...HOOKS, { version: '1.7.0', profile: { journalMode: 'wal' } }];
  const [, local] = parseUpgradePath('1.6.0,local', { hookFiles });
  assert.equal(local.version, '1.8.0');
  assert.deepEqual(hooksForJump(hookFiles, '1.6.0', local.version).map((hooks) => hooks.version), ['1.7.0']);
  assert.equal(profileOf(hookFiles, local.version).journalMode, 'wal');
});

test('hooksForJump returns every crossed release, oldest first', () => {
  assert.deepEqual(hooksForJump(HOOKS, '1.4.0', '1.6.0-rc.1').map((hooks) => hooks.version), ['1.5.0', '1.6.0']);
  assert.deepEqual(hooksForJump(HOOKS, '1.5.0', '1.6.0').map((hooks) => hooks.version), ['1.6.0']);
  assert.deepEqual(hooksForJump(HOOKS, '1.6.0-rc.1', '1.6.0'), []);
});

test('profileOf merges the profiles of all releases up to the version', () => {
  assert.deepEqual(profileOf(HOOKS, '1.5.1'), { uploadDir: '/app/uploads', migrations: false, refusals: [] });
  assert.deepEqual(profileOf(HOOKS, '1.6.0-rc.1'), { uploadDir: '/app/uploads', migrations: true, refusals: [] });
});

test('profileOf adds up the refusals of the releases up to the version', () => {
  const baseline = { log: 'does not match migration 0_init', database: 'untouched' };
  const failedMigration = { log: 'failed. The backend will not start.', database: 'backupBeforeJump' };
  const hookFiles = [
    ...HOOKS.map((hooks) => (hooks.version === '1.6.0' ? { ...hooks, profile: { ...hooks.profile, refusals: [baseline] } } : hooks)),
    { version: '1.7.0', profile: {} },
    { version: '1.8.0', profile: { refusals: [failedMigration] } },
  ];
  assert.deepEqual(profileOf(hookFiles, '1.5.0').refusals, []);
  assert.deepEqual(profileOf(hookFiles, '1.7.0').refusals, [baseline]);
  assert.deepEqual(profileOf(hookFiles, '1.8.0-rc.1').refusals, [baseline, failedMigration]);
});

test('latestHookVersion picks the newest hook file', () => {
  assert.equal(latestHookVersion(HOOKS), '1.6.0');
});
