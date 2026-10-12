import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isStrongJwtSecret } from '../lib/actions.mjs';
import {
  BASELINE_REFUSAL, checkImages, checkLogLines, checkRefusalMessage, checkRefusedDatabase, checkRowCounts,
  checkUploadsPersistent, FAILED_MIGRATION_REFUSAL, findRefusal,
} from '../lib/checks.mjs';
import { parseSnapshot } from '../lib/database.mjs';
import { parseLastExitCode } from '../lib/docker.mjs';
import { allowedFailures, isRequirementMet, markExpected, unexpectedFailures } from '../lib/expectations.mjs';
import {
  BACKEND_SERVICE, FRONTEND_SERVICE, Instance, publishedContainerPort, readEnvVariable, renderTemplate, writeEnvVariable,
} from '../lib/instance.mjs';

const LAYOUTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'layouts');
const ENTRYPOINT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'backend', 'docker-entrypoint.sh');
// First lines printed by the entrypoint for each refusal.
const BASELINE_REFUSAL_LOGS = [
  'ERROR: the existing database at /app/data/carta_cocktail.db has no migration history and does not match migration 0_init.',
  'The backend will not start, and its data and schema were not modified. A copy is in /app/data/backups.',
].join('\n');
const FAILED_MIGRATION_LOGS = [
  'Error: P3009',
  'ERROR: migration 20261010173910_schema_integrity failed. The backend will not start.',
  'Newest copy made before a migration: /app/data/backups/pre-migrate-20261012-101500.db (with its -wal file when there is one).',
].join('\n');
// Port the frontend container listens on, per compose generation of the layouts.
const FRONTEND_PORT_BY_GENERATION = { '1.4.0': 80, '1.5.0': 80, '1.8.0': 8080 };

test('parseSnapshot reads the helper output', () => {
  const snapshot = parseSnapshot([
    'fingerprint|abc', 'backups|       2', 'latestBackup|def', 'integrity|ok ', 'journal|wal',
    'count|Cocktail|42', 'count|User|1', 'image|1.jpg', 'image|2.jpg', '',
  ].join('\n'));
  assert.deepEqual(snapshot, {
    fingerprint: 'abc', backups: 2, latestBackupFingerprint: 'def', integrity: 'ok', journalMode: 'wal',
    counts: { Cocktail: 42, User: 1 }, imagePaths: ['1.jpg', '2.jpg'],
  });
  assert.equal(parseSnapshot('fingerprint|abc\nbackups|0\n').latestBackupFingerprint, undefined);
});

test('the refusal messages are the ones the entrypoint prints', () => {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  // The 0_init message names the migration through a variable.
  const baselineMigration = /^BASELINE_MIGRATION=(\S+)$/m.exec(source)[1];
  const entrypoint = source.replaceAll('$BASELINE_MIGRATION', baselineMigration);
  for (const refusal of [BASELINE_REFUSAL, FAILED_MIGRATION_REFUSAL]) {
    assert.ok(entrypoint.includes(refusal.log), refusal.log);
  }
});

test('findRefusal recognises each refusal, and only its own message', () => {
  const refusals = [BASELINE_REFUSAL, FAILED_MIGRATION_REFUSAL];
  assert.equal(findRefusal(refusals, BASELINE_REFUSAL_LOGS), BASELINE_REFUSAL);
  assert.equal(findRefusal(refusals, FAILED_MIGRATION_LOGS), FAILED_MIGRATION_REFUSAL);
  assert.equal(findRefusal(refusals, 'ERROR: the backend runs as uid 1000 and cannot write to /app/data.'), null);
  assert.equal(findRefusal([BASELINE_REFUSAL], FAILED_MIGRATION_LOGS), null);
});

test('checkRefusalMessage reports the message found, or every message it looked for', () => {
  const refusals = [BASELINE_REFUSAL, FAILED_MIGRATION_REFUSAL];
  const found = checkRefusalMessage(refusals, FAILED_MIGRATION_REFUSAL);
  assert.equal(found.status, 'ok');
  assert.equal(found.detail, '"failed. The backend will not start." found');
  const missing = checkRefusalMessage(refusals, null);
  assert.equal(missing.status, 'ko');
  assert.equal(missing.detail, 'none found: "does not match migration 0_init", "failed. The backend will not start."');
  assert.equal(checkRefusalMessage([], null).status, 'info');
});

test('checkRefusedDatabase: the 0_init refusal, or an unknown one, must leave the database file unchanged', () => {
  const before = { fingerprint: 'aaa' };
  for (const refusal of [BASELINE_REFUSAL, null]) {
    const untouched = checkRefusedDatabase(refusal, before, { fingerprint: 'aaa', latestBackupFingerprint: 'aaa' });
    assert.deepEqual([untouched.label, untouched.status], ['database left untouched by the refused start', 'ok']);
    const changed = checkRefusedDatabase(refusal, before, { fingerprint: 'bbb', latestBackupFingerprint: 'aaa' });
    assert.deepEqual([changed.status, changed.detail], ['ko', 'database file changed']);
  }
});

test('checkRefusedDatabase: a failed migration must leave a pre-migrate copy of the database before the jump', () => {
  const before = { fingerprint: 'aaa' };
  const kept = checkRefusedDatabase(FAILED_MIGRATION_REFUSAL, before, { fingerprint: 'bbb', latestBackupFingerprint: 'aaa' });
  assert.deepEqual([kept.label, kept.status, kept.detail],
    ['newest pre-migrate copy holds the database before the jump', 'ok', 'same SHA-256 as the database before the jump']);
  const other = checkRefusedDatabase(FAILED_MIGRATION_REFUSAL, before, { fingerprint: 'bbb', latestBackupFingerprint: 'ccc' });
  assert.deepEqual([other.status, other.detail], ['ko', 'SHA-256 differs from the database before the jump']);
  const none = checkRefusedDatabase(FAILED_MIGRATION_REFUSAL, before, { fingerprint: 'bbb' });
  assert.deepEqual([none.status, none.detail], ['ko', 'no pre-migrate copy']);
});

test('parseLastExitCode keeps the code of the last die event', () => {
  assert.equal(parseLastExitCode('1\n1\n0\n'), 0);
  assert.equal(parseLastExitCode('0\n1\n'), 1);
  assert.equal(parseLastExitCode(''), null);
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
  assert.deepEqual(naive, { images: 'photos lost', frontendImages: 'photos lost' });
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

test('expectations: a layout reason replaces the reason of the notes in naive mode only', () => {
  const crossedHooks = [{ naiveMayFail: { images: 'photos lost', startup: 'weak secret' } }];
  const layoutReasons = { images: 'custom photo mount', uploadsPersistent: 'custom photo mount' };
  const profile = { knownIssues: {} };
  assert.deepEqual(allowedFailures({ mode: 'naive', profile, crossedHooks, unmetRequirements: [], layoutReasons }),
    { images: 'custom photo mount', frontendImages: 'custom photo mount', startup: 'weak secret' });
  assert.deepEqual(allowedFailures({ mode: 'conformant', profile, crossedHooks, unmetRequirements: [], layoutReasons }), {});
});

test('expectations: conformant mode does not inherit previous failures', () => {
  const rows = [{ group: 'images', status: 'ko' }];
  markExpected(rows, { mode: 'conformant', allowed: {}, previousFailedGroups: new Set(['images']) });
  assert.equal(unexpectedFailures(rows).length, 1);
});

test('isRequirementMet accepts a started version, or a direct jump from the allowed release line', () => {
  const hook = { action: 'requireStarted', version: '1.5.0', directFrom: '1.4' };
  assert.equal(isRequirementMet(hook, new Set(['1.5.0']), '1.5.0'), true);
  assert.equal(isRequirementMet(hook, new Set(['1.4.0']), '1.4.0'), true);
  assert.equal(isRequirementMet(hook, new Set(['1.3.0']), '1.3.0'), false);
  assert.equal(isRequirementMet({ ...hook, directFrom: undefined }, new Set(['1.4.0']), '1.4.0'), false);
});

test('expectations: frontendImages may fail whenever images may, unless the notes give their own reason', () => {
  const profile = { knownIssues: {} };
  const photosLost = [{ naiveMayFail: { images: 'photos lost' } }];
  const portChanged = [{ naiveMayFail: { frontend: 'port changed', frontendImages: 'port changed' } }];
  assert.equal(allowedFailures({ mode: 'naive', profile, crossedHooks: photosLost, unmetRequirements: [] }).frontendImages, 'photos lost');
  assert.equal(allowedFailures({ mode: 'naive', profile, crossedHooks: [...photosLost, ...portChanged], unmetRequirements: [] }).frontendImages,
    'port changed');
  assert.deepEqual(allowedFailures({ mode: 'naive', profile, crossedHooks: portChanged, unmetRequirements: [] }),
    { frontend: 'port changed', frontendImages: 'port changed' });

  const knownBug = { knownIssues: { images: 'known bug' } };
  assert.equal(allowedFailures({ mode: 'conformant', profile: knownBug, crossedHooks: [], unmetRequirements: [] }).frontendImages, 'known bug');
  assert.equal(allowedFailures({ mode: 'conformant', profile, crossedHooks: photosLost, unmetRequirements: [] }).frontendImages, undefined);
});

test('checkImages reports in the group it is given', async () => {
  const backend = await checkImages('images', 'http://127.0.0.1:9', [], 'backend');
  const nginx = await checkImages('frontendImages', 'http://127.0.0.1:9', [], 'frontend nginx');
  assert.deepEqual([backend.group, nginx.group], ['images', 'frontendImages']);
  assert.equal(nginx.label, 'photos via frontend nginx');
});

test('publishedContainerPort reads the container port of one service only', () => {
  const compose = [
    'services:',
    '  carta-cocktail-backend:',
    '    ports:',
    '      - "127.0.0.1::3001"',
    '',
    '  carta-cocktail-frontend:',
    '    # comment',
    '    ports:',
    '      - "127.0.0.1::8080"',
    'volumes:',
    '  data:',
  ].join('\n');
  assert.equal(publishedContainerPort(compose, FRONTEND_SERVICE), 8080);
  assert.equal(publishedContainerPort(compose, BACKEND_SERVICE), 3001);
  assert.throws(() => publishedContainerPort(compose, 'other'), /No service other/);
  assert.throws(() => publishedContainerPort('services:\n  carta-cocktail-frontend:\n    image: x\n', FRONTEND_SERVICE),
    /No "127.0.0.1::<port>" published/);
});

test('every compose generation of every layout publishes the frontend port its image listens on', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-layout-test-'));
  try {
    for (const name of fs.readdirSync(LAYOUTS_DIR)) {
      const layoutDir = path.join(LAYOUTS_DIR, name);
      const layout = (await import(pathToFileURL(path.join(layoutDir, 'layout.mjs')))).default;
      const instance = new Instance({ project: 'test', layout, layoutDir, workDir: path.join(workDir, name) });
      const generations = fs.readdirSync(layoutDir)
        .map((file) => /^compose-(.+)\.yml$/.exec(file)?.[1])
        .filter(Boolean);
      assert.deepEqual(generations.sort(), Object.keys(FRONTEND_PORT_BY_GENERATION).sort(), `generations of ${name}`);
      for (const generation of generations) {
        instance.generation = generation;
        assert.equal(instance.frontendContainerPort(), FRONTEND_PORT_BY_GENERATION[generation], `${name} compose-${generation}.yml`);
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
