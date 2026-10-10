import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStrongJwtSecret } from '../lib/actions.mjs';
import { checkLogLines, checkRowCounts, checkUploadsPersistent } from '../lib/checks.mjs';
import { parseSnapshot } from '../lib/database.mjs';
import { allowedFailures, markExpected, unexpectedFailures } from '../lib/expectations.mjs';
import { readEnvVariable, renderTemplate, writeEnvVariable } from '../lib/instance.mjs';

test('parseSnapshot reads the helper output', () => {
  const snapshot = parseSnapshot([
    'fingerprint|abc', 'backups|       2', 'integrity|ok ', 'journal|wal',
    'count|Cocktail|42', 'count|User|1', 'image|1.jpg', 'image|2.jpg', '',
  ].join('\n'));
  assert.deepEqual(snapshot, {
    fingerprint: 'abc', backups: 2, integrity: 'ok', journalMode: 'wal',
    counts: { Cocktail: 42, User: 1 }, imagePaths: ['1.jpg', '2.jpg'],
  });
});

test('checkRowCounts fails on a lost row and reports new tables', () => {
  const baseline = { counts: { Cocktail: 42, Unit: 10 } };
  const grown = checkRowCounts(baseline, { counts: { Cocktail: 42, Unit: 12, _prisma_migrations: 1 } });
  assert.equal(grown.status, 'ok');
  assert.match(grown.detail, /Unit \+2/);
  assert.match(grown.detail, /_prisma_migrations \(1\)/);
  const lost = checkRowCounts(baseline, { counts: { Cocktail: 41 } });
  assert.equal(lost.status, 'ko');
  assert.match(lost.detail, /Cocktail 42 -> 41, Unit 10 -> missing/);
});

test('checkUploadsPersistent needs a mount on the upload folder or a parent', () => {
  assert.equal(checkUploadsPersistent([{ Destination: '/app/uploads', Type: 'volume' }], '/app/uploads').status, 'ok');
  assert.equal(checkUploadsPersistent([{ Destination: '/app', Type: 'bind' }], '/app/uploads').status, 'ok');
  const missing = checkUploadsPersistent([{ Destination: '/uploads', Type: 'bind' }], '/app/uploads');
  assert.equal(missing.status, 'ko');
  assert.match(missing.detail, /inside the container \(mounts: \/uploads\)/);
});

test('checkLogLines reports each expected line', () => {
  const rows = checkLogLines('a\nSQLite journal mode: wal\n', ['SQLite journal mode: wal', 'missing line']);
  assert.deepEqual(rows.map((result) => result.status), ['ok', 'ko']);
});

test('isStrongJwtSecret refuses short and published secrets', () => {
  assert.equal(isStrongJwtSecret('x'.repeat(46)), true);
  assert.equal(isStrongJwtSecret('x'.repeat(31)), false);
  assert.equal(isStrongJwtSecret('change-me-to-a-random-secret'), false);
  assert.equal(isStrongJwtSecret(undefined), false);
});

test('env helpers read, replace and add variables', () => {
  const text = 'JWT_SECRET=abc\nADMIN_PASSWORD=123456\n';
  assert.equal(readEnvVariable(text, 'ADMIN_PASSWORD'), '123456');
  assert.equal(readEnvVariable(text, 'MISSING'), undefined);
  assert.equal(writeEnvVariable(text, 'JWT_SECRET', 'new'), 'JWT_SECRET=new\nADMIN_PASSWORD=123456\n');
  assert.equal(writeEnvVariable(text, 'PORT', '3001'), 'JWT_SECRET=abc\nADMIN_PASSWORD=123456\nPORT=3001\n');
});

test('renderTemplate refuses an unknown placeholder', () => {
  assert.equal(renderTemplate('image: {{IMAGE}}', { IMAGE: 'x' }), 'image: x');
  assert.throws(() => renderTemplate('{{OTHER}}', {}), /No value for \{\{OTHER\}\}/);
});

test('expectations: naive failures listed by the notes and inherited ones are expected', () => {
  const crossedHooks = [{ naiveMayFail: { images: 'photos lost' } }];
  const profile = { knownIssues: {} };
  const naive = allowedFailures({ mode: 'naive', profile, crossedHooks, unmetRequirements: [] });
  const conformant = allowedFailures({ mode: 'conformant', profile, crossedHooks, unmetRequirements: ['v1.5.0'] });
  assert.deepEqual(naive, { images: 'photos lost' });
  assert.match(conformant.startup, /skips v1.5.0/);

  const rows = [
    { group: 'images', status: 'ko' },
    { group: 'login', status: 'ko' },
    { group: 'rowCounts', status: 'ko' },
    { group: 'startup', status: 'ok' },
  ];
  markExpected(rows, { mode: 'naive', allowed: naive, previousFailedGroups: new Set(['login']) });
  assert.deepEqual(rows.map((result) => result.expected ?? null), ['photos lost', 'already failing at the previous step', null, null]);
  assert.deepEqual(unexpectedFailures(rows).map((result) => result.group), ['rowCounts']);
});

test('expectations: conformant mode does not inherit previous failures', () => {
  const rows = [{ group: 'images', status: 'ko' }];
  markExpected(rows, { mode: 'conformant', allowed: {}, previousFailedGroups: new Set(['images']) });
  assert.equal(unexpectedFailures(rows).length, 1);
});
