import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderReport, resultLabel, stepVerdict } from '../lib/report.mjs';

const okStep = {
  from: null, to: '1.4.0', actions: [],
  checks: [{ group: 'startup', label: 'backend starts', status: 'ok', detail: 'API running' }],
};
const failedStep = {
  from: '1.4.0', to: '1.5.0',
  actions: [{ step: 'v1.5.0 Before 1', note: 'copy | photos', status: 'done', detail: '42 files' }],
  checks: [
    { group: 'images', label: 'photos via backend', status: 'ko', detail: '0/42 in 200' },
    { group: 'uploadsPersistent', label: 'upload folder', status: 'ko', detail: 'inside', expected: 'known bug' },
  ],
};

test('resultLabel shows the reason of an expected failure', () => {
  assert.equal(resultLabel({ status: 'ko', expected: 'known bug' }), 'KO (expected: known bug)');
  assert.equal(resultLabel({ status: 'skip' }), 'skipped');
});

test('stepVerdict lists unexpected failures, or counts the expected ones', () => {
  assert.equal(stepVerdict(okStep), 'OK');
  assert.equal(stepVerdict(failedStep), '**KO**: photos via backend');
  assert.equal(stepVerdict({ ...failedStep, checks: failedStep.checks.slice(1) }), 'OK, 1 expected failure(s)');
});

test('stepVerdict shows the required actions that were not met', () => {
  const notMet = { step: 'v1.6.0 Before 1', note: 'start v1.5.0 first', status: 'not met', detail: '' };
  assert.equal(stepVerdict({ ...okStep, actions: [notMet] }), 'OK, 1 required action(s) not met');
  assert.equal(stepVerdict({ ...failedStep, actions: [notMet] }), '**KO**: photos via backend; 1 required action(s) not met');
});

test('renderReport writes a summary column per mode and escapes table cells', () => {
  const report = renderReport({
    generatedAt: '2026-10-10T00:00:00.000Z',
    layout: { name: 'friend', description: 'bind mounts', envSecrets: { JWT_SECRET: 46 } },
    pathLabels: ['1.4.0', '1.5.0'],
    images: { '1.4.0': { backend: 'b', frontend: 'f', platform: 'linux/amd64' } },
    runs: [
      { mode: 'naive', setup: { tables: 15, rows: 758, users: 1 }, steps: [okStep] },
      {
        mode: 'conformant', setup: { tables: 15, rows: 758, users: 1 }, steps: [okStep, failedStep],
        kept: { project: 'p', workDir: '/w' }, cleanupWarnings: ['cannot delete /x'],
      },
    ],
  });
  assert.match(report, /# Upgrade test: friend layout, 1\.4\.0 → 1\.5\.0/);
  assert.match(report, /\| Step \| naive \| conformant \|/);
  assert.match(report, /\| 1\.4\.0 → 1\.5\.0 \| not run \| \*\*KO\*\*: photos via backend \|/);
  assert.match(report, /copy \\\| photos/);
  assert.match(report, /Environment kept for inspection/);
  assert.match(report, /\*\*Cleanup warnings\*\*: cannot delete \/x/);
});
