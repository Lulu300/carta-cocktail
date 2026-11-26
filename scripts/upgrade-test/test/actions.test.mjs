import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAILED_MIGRATION_REFUSAL, UNWRITABLE_REFUSAL } from '../lib/checks.mjs';
import { judgeDatabaseCopy, mountsToChown, runAction } from '../lib/actions.mjs';

const VOLUME = { Type: 'volume', Name: 'carta-ut-1_db-data', Source: '/var/lib/docker/volumes/carta-ut-1_db-data/_data', Destination: '/app/data' };
const BIND = { Type: 'bind', Source: '/tmp/carta-upgrade-test/run/uploads', Destination: '/app/uploads' };
const OTHER = { Type: 'bind', Source: '/etc/localtime', Destination: '/etc/localtime' };

test('mountsToChown gives the volume name and the host folder, in the order asked', () => {
  assert.deepEqual(mountsToChown([BIND, OTHER, VOLUME], ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
    { destination: '/app/uploads', type: 'bind', source: '/tmp/carta-upgrade-test/run/uploads' },
  ]);
});

test('mountsToChown leaves out a destination without a mount', () => {
  assert.deepEqual(mountsToChown([VOLUME], ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
  ]);
  assert.deepEqual(mountsToChown([OTHER], ['/app/data']), []);
});

const START_LOGS = ['SQLite journal mode: wal', 'Carta Cocktail API running on port 3001'];

const REFUSALS = [UNWRITABLE_REFUSAL, FAILED_MIGRATION_REFUSAL];
const notRunning = () => assert.fail('copy not running');

test('judgeDatabaseCopy: a refused copy names the refusal found in its logs', () => {
  const cases = [
    ['Migration 8_schema_integrity failed. The backend will not start.', FAILED_MIGRATION_REFUSAL, '"failed. The backend will not start."'],
    ['ERROR: /app/data: cannot write to /app/data', UNWRITABLE_REFUSAL, '"cannot write to"'],
    ['something else went wrong', null, 'no known refusal message'],
  ];
  for (const [logs, refusal, named] of cases) {
    assert.deepEqual(judgeDatabaseCopy({ started: false, exitCode: 1, logs }, START_LOGS, notRunning, REFUSALS), {
      status: 'failed',
      refused: true,
      refusal,
      detail: `the copy was refused (exit code 1, ${named}): the notes say not to upgrade`,
    });
  }
});

test('judgeDatabaseCopy: a copy that started is never refused, even when it fails', () => {
  const logs = START_LOGS.join('\n');
  assert.deepEqual(judgeDatabaseCopy({ started: true, logs }, START_LOGS, () => 'Database schema is up to date!', REFUSALS),
    { status: 'done', detail: 'copy started, 2/2 expected log lines, migrate status up to date' });
  assert.deepEqual(judgeDatabaseCopy({ started: true, logs: START_LOGS[1] }, START_LOGS, () => 'Following migration have not yet been applied', REFUSALS),
    { status: 'failed', detail: 'copy started, 1/2 expected log lines, migrate status NOT up to date' });
});

test('runAction keeps every field the action returns, and turns an error into a failure', async () => {
  const actions = {
    refusedCopy: () => ({ status: 'failed', refused: true, detail: 'refused' }),
    broken: () => { throw new Error('docker failed'); },
  };
  const ctx = { hooksVersion: '1.6.0' };
  assert.deepEqual(await runAction(ctx, { step: 'Before 4', action: 'refusedCopy', note: 'n' }, actions),
    { step: 'v1.6.0 Before 4', action: 'refusedCopy', note: 'n', status: 'failed', refused: true, detail: 'refused' });
  assert.deepEqual(await runAction(ctx, { step: 'Before 1', action: 'broken', note: 'n' }, actions),
    { step: 'v1.6.0 Before 1', action: 'broken', note: 'n', status: 'failed', detail: 'docker failed' });
});
