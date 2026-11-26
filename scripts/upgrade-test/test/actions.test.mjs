import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeDatabaseCopy, plannedMountsToChown, runAction } from '../lib/actions.mjs';

const SERVICE = 'carta-cocktail-backend';
const DATA_BIND = { type: 'bind', source: '/tmp/carta-ut-1/instance/data', target: '/app/data' };
const UPLOADS_BIND = { type: 'bind', source: '/tmp/carta-ut-1/instance/uploads', target: '/app/uploads' };
const OLD_UPLOADS_BIND = { type: 'bind', source: '/tmp/carta-ut-1/instance/uploads', target: '/uploads' };
const DATA_VOLUME = { type: 'volume', source: 'db-data', target: '/app/data' };
const volumes = { 'db-data': { name: 'carta-ut-1_db-data' } };
const configOf = (...mounts) => ({ services: { [SERVICE]: { volumes: mounts }, other: { volumes: [UPLOADS_BIND] } }, volumes });

test('plannedMountsToChown gives the volume name and the host folder, in the order asked', () => {
  assert.deepEqual(plannedMountsToChown(configOf(UPLOADS_BIND, DATA_VOLUME), SERVICE, ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
    { destination: '/app/uploads', type: 'bind', source: '/tmp/carta-ut-1/instance/uploads' },
  ]);
});

test('plannedMountsToChown leaves out a destination without a mount', () => {
  assert.deepEqual(plannedMountsToChown(configOf(DATA_VOLUME), SERVICE, ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
  ]);
  assert.deepEqual(plannedMountsToChown(configOf(OLD_UPLOADS_BIND), SERVICE, ['/app/uploads']), []);
  assert.deepEqual(plannedMountsToChown({ services: { [SERVICE]: {} } }, SERVICE, ['/app/data']), []);
});

test('plannedMountsToChown reads the service asked only', () => {
  const config = { services: { [SERVICE]: { volumes: [DATA_BIND] }, other: { volumes: [UPLOADS_BIND] } } };
  assert.deepEqual(plannedMountsToChown(config, SERVICE, ['/app/data', '/app/uploads']).map((mount) => mount.destination), ['/app/data']);
});

const START_LOGS = ['SQLite journal mode: wal', 'Carta Cocktail API running on port 3001'];

test('judgeDatabaseCopy: a copy that does not start is refused', () => {
  const result = judgeDatabaseCopy({ started: false, exitCode: 1, logs: '' }, START_LOGS, () => assert.fail('copy not running'));
  assert.deepEqual(result, {
    status: 'failed', refused: true, detail: 'the copy was refused (exit code 1): the notes say not to upgrade',
  });
});

test('judgeDatabaseCopy: a copy that started is never refused, even when it fails', () => {
  const logs = START_LOGS.join('\n');
  assert.deepEqual(judgeDatabaseCopy({ started: true, logs }, START_LOGS, () => 'Database schema is up to date!'),
    { status: 'done', detail: 'copy started, 2/2 expected log lines, migrate status up to date' });
  assert.deepEqual(judgeDatabaseCopy({ started: true, logs: START_LOGS[1] }, START_LOGS, () => 'Following migration have not yet been applied'),
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
