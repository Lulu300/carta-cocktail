import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersions, hooksForJump, latestHookVersion, parseUpgradePath, profileOf, releaseOf,
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
  const steps = parseUpgradePath('1.4.0, 1.6.0-rc.1,local', '1.6.0');
  assert.deepEqual(steps.map((step) => [step.label, step.version, step.local]), [
    ['1.4.0', '1.4.0', false], ['1.6.0-rc.1', '1.6.0-rc.1', false], ['local', '1.6.0', true],
  ]);
  assert.throws(() => parseUpgradePath('1.5.0,1.4.0', '1.6.0'), /must go up/);
  assert.throws(() => parseUpgradePath('1.5.0', '1.6.0'), /at least two/);
  assert.throws(() => parseUpgradePath('1.4.0,latest', '1.6.0'), /Invalid version/);
});

test('hooksForJump returns every crossed release, oldest first', () => {
  assert.deepEqual(hooksForJump(HOOKS, '1.4.0', '1.6.0-rc.1').map((hooks) => hooks.version), ['1.5.0', '1.6.0']);
  assert.deepEqual(hooksForJump(HOOKS, '1.5.0', '1.6.0').map((hooks) => hooks.version), ['1.6.0']);
  assert.deepEqual(hooksForJump(HOOKS, '1.6.0-rc.1', '1.6.0'), []);
});

test('profileOf merges the profiles of all releases up to the version', () => {
  assert.deepEqual(profileOf(HOOKS, '1.5.1'), { uploadDir: '/app/uploads', migrations: false });
  assert.deepEqual(profileOf(HOOKS, '1.6.0-rc.1'), { uploadDir: '/app/uploads', migrations: true });
});

test('latestHookVersion picks the newest hook file', () => {
  assert.equal(latestHookVersion(HOOKS), '1.6.0');
});
