import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseUnifiedDiff,
  lineCoverage,
  computeDelta,
  formatReport,
} from './delta-coverage-lib.mjs';

const ROOT = '/repo';

/** Builds a coverage-final.json entry from [startLine, endLine, hits] tuples. */
function fileCoverage(statements) {
  const statementMap = {};
  const s = {};
  statements.forEach(([startLine, endLine, hits], index) => {
    statementMap[index] = {
      start: { line: startLine, column: 0 },
      end: { line: endLine, column: null },
    };
    s[index] = hits;
  });
  return { statementMap, s };
}

function lines(...numbers) {
  return new Set(numbers);
}

describe('parseUnifiedDiff', () => {
  it('collects the added lines of a modified file with two hunks', () => {
    const diff = [
      'diff --git a/backend/src/a.ts b/backend/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -3 +3,2 @@ export function a() {',
      '-  return 1;',
      '+  const x = 1;',
      '+  return x;',
      '@@ -20,0 +21,1 @@',
      '+export const b = 2;',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', lines(3, 4, 21)]]));
  });

  it('collects every line of a new file', () => {
    const diff = [
      'diff --git a/backend/src/new.ts b/backend/src/new.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/backend/src/new.ts',
      '@@ -0,0 +1,3 @@',
      '+export function add(a: number, b: number) {',
      '+  return a + b;',
      '+}',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/new.ts', lines(1, 2, 3)]]));
  });

  it('ignores a deleted file', () => {
    const diff = [
      'diff --git a/backend/src/gone.ts b/backend/src/gone.ts',
      'deleted file mode 100644',
      '--- a/backend/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const gone = 1;',
      '-export const alsoGone = 2;',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map());
  });

  it('records nothing for a pure deletion hunk', () => {
    const diff = [
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -12,2 +12,0 @@',
      '-const unused = 1;',
      '-const alsoUnused = 2;',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map());
  });

  it('reads a hunk header without a line count as one line', () => {
    const diff = ['--- a/backend/src/a.ts', '+++ b/backend/src/a.ts', '@@ -7 +7 @@', '-old();', '+fresh();'].join(
      '\n',
    );

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', lines(7)]]));
  });

  it('keys a renamed and modified file by its new path', () => {
    const diff = [
      'diff --git a/backend/src/old.ts b/backend/src/renamed.ts',
      'similarity index 90%',
      'rename from backend/src/old.ts',
      'rename to backend/src/renamed.ts',
      'index 4444444..5555555 100644',
      '--- a/backend/src/old.ts',
      '+++ b/backend/src/renamed.ts',
      '@@ -5 +5 @@',
      '-const name = "old";',
      '+const name = "renamed";',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/renamed.ts', lines(5)]]));
  });

  it('does not attach hunks to a previous file after a pure rename', () => {
    const diff = [
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -1 +1 @@',
      '-a();',
      '+b();',
      'diff --git a/backend/src/x.ts b/backend/src/y.ts',
      'similarity index 100%',
      'rename from backend/src/x.ts',
      'rename to backend/src/y.ts',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', lines(1)]]));
  });

  it('skips blank added lines and reads "+++" inside a hunk as content', () => {
    const diff = [
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -0,0 +1,3 @@',
      '+const a = 1;',
      '+   ',
      '+++counter;',
      '\\ No newline at end of file',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', lines(1, 3)]]));
  });

  it('follows context lines when the diff has some', () => {
    const diff = [
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -10,3 +10,3 @@',
      ' keep();',
      '-old();',
      '+fresh();',
      ' keep();',
    ].join('\n');

    assert.deepEqual(parseUnifiedDiff(diff), new Map([['backend/src/a.ts', lines(11)]]));
  });
});

describe('lineCoverage', () => {
  it('attributes an executed multi-line statement to its start line only', () => {
    const hits = lineCoverage(fileCoverage([[10, 60, 1]]));

    assert.deepEqual(hits, new Map([[10, 1]]));
  });

  it('leaves an inner line uncovered when its own statement never ran', () => {
    const hits = lineCoverage(
      fileCoverage([
        [10, 60, 1],
        [20, 20, 0],
      ]),
    );

    assert.equal(hits.get(10), 1);
    assert.equal(hits.get(20), 0);
  });

  it('keeps the highest count when several statements start on the same line', () => {
    const hits = lineCoverage(
      fileCoverage([
        [5, 5, 0],
        [5, 5, 3],
      ]),
    );

    assert.equal(hits.get(5), 3);
  });
});

describe('computeDelta', () => {
  // router.get('/x', async (req, res) => { ... }) runs at import time,
  // but the statements of its body (lines 11-14) never ran.
  const expressHandler = fileCoverage([
    [10, 15, 1],
    [11, 11, 0],
    [12, 12, 0],
    [13, 14, 0],
  ]);

  it('does not count the inner lines of an executed handler as covered', () => {
    const result = computeDelta({
      changedLines: new Map([['backend/src/routes/x.ts', lines(11, 12, 13, 14)]]),
      coverage: { '/repo/backend/src/routes/x.ts': expressHandler },
      root: ROOT,
      scope: 'backend/src/',
    });

    // Line 14 is the inside of a statement starting on 13: not executable on its own.
    assert.deepEqual(result.files, [
      { file: 'backend/src/routes/x.ts', changed: 3, covered: 0, missingFromReport: false },
    ]);
    assert.equal(result.pct, 0);
  });

  it('measures the covered share of the changed lines', () => {
    const result = computeDelta({
      changedLines: new Map([['backend/src/routes/x.ts', lines(10, 11, 12, 30)]]),
      coverage: { '/repo/backend/src/routes/x.ts': expressHandler },
      root: ROOT,
      scope: 'backend/src/',
    });

    // 10 covered, 11 and 12 not, 30 is not executable.
    assert.equal(result.changed, 3);
    assert.equal(result.covered, 1);
    assert.equal(result.pct, 33.3);
  });

  it('counts a file of the scope missing from the report as 0%', () => {
    const result = computeDelta({
      changedLines: new Map([['backend/src/utils/untested.ts', lines(1, 2, 3)]]),
      coverage: {},
      root: ROOT,
      scope: 'backend/src/',
    });

    assert.deepEqual(result.files, [
      { file: 'backend/src/utils/untested.ts', changed: 3, covered: 0, missingFromReport: true },
    ]);
    assert.equal(result.pct, 0);
  });

  it('ignores files outside the scope', () => {
    const result = computeDelta({
      changedLines: new Map([['backend/src/utils/untested.ts', lines(1, 2)]]),
      coverage: {},
      root: ROOT,
      scope: 'frontend/src/',
    });

    assert.deepEqual(result.files, []);
    assert.equal(result.pct, null);
  });

  it('ignores files matching an --ignore glob', () => {
    const result = computeDelta({
      changedLines: new Map([
        ['frontend/src/main.tsx', lines(1)],
        ['frontend/src/i18n/locales/setup.ts', lines(1)],
      ]),
      coverage: {},
      root: ROOT,
      scope: 'frontend/src/',
      ignore: ['frontend/src/main.tsx', 'frontend/src/i18n/**'],
    });

    assert.deepEqual(result.files, []);
  });

  it('ignores test files, declaration files and non-TypeScript files', () => {
    const result = computeDelta({
      changedLines: new Map([
        ['backend/src/routes/x.test.ts', lines(1)],
        ['frontend/src/pages/Page.test.tsx', lines(1)],
        ['backend/src/types/env.d.ts', lines(1)],
        ['backend/src/i18n/en.json', lines(1)],
      ]),
      coverage: {},
      root: ROOT,
      scope: '',
    });

    assert.deepEqual(result.files, []);
  });

  it('skips a covered file whose changed lines hold no statement', () => {
    const result = computeDelta({
      changedLines: new Map([['backend/src/routes/x.ts', lines(40, 41)]]),
      coverage: { '/repo/backend/src/routes/x.ts': expressHandler },
      root: ROOT,
      scope: 'backend/src/',
    });

    assert.deepEqual(result.files, []);
    assert.equal(result.pct, null);
  });
});

describe('formatReport', () => {
  it('lists the worst files first and flags those missing from the report', () => {
    const report = formatReport(
      {
        files: [
          { file: 'backend/src/good.ts', changed: 4, covered: 4, missingFromReport: false },
          { file: 'backend/src/new.ts', changed: 2, covered: 0, missingFromReport: true },
        ],
        changed: 6,
        covered: 4,
        pct: 66.7,
      },
      80,
    );

    const rows = report.split('\n');
    assert.ok(rows.findIndex((r) => r.includes('new.ts')) < rows.findIndex((r) => r.includes('good.ts')));
    assert.match(report, /backend\/src\/new\.ts.*0%.*not in coverage report/);
    assert.match(report, /TOTAL\s+6\s+4\s+66\.7%/);
  });
});

describe('delta-coverage.mjs CLI', () => {
  const cli = fileURLToPath(new URL('./delta-coverage.mjs', import.meta.url));
  let repo;

  function git(...args) {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  }

  function writeRepoFile(path, content) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }

  function writeCoverage(entries) {
    writeRepoFile('coverage-final.json', JSON.stringify(entries));
    return join(repo, 'coverage-final.json');
  }

  function runCli(args) {
    return spawnSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf-8' });
  }

  // A throwaway repository: the "base" tag holds one file; HEAD modifies it and
  // adds an untested file under backend/src plus a file outside the scope.
  before(() => {
    // realpath: on macOS the temp dir is a symlink, and git reports the resolved path.
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'delta-coverage-')));
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    writeRepoFile('backend/src/tested.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    git('tag', 'base');
    writeRepoFile('backend/src/tested.ts', 'export const a = 1;\nexport const b = 2;\n');
    writeRepoFile('backend/src/untested.ts', 'export function f() {\n  return 1;\n}\n');
    writeRepoFile('frontend/src/other.ts', 'export const c = 3;\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'change');
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('fails when a changed file of the scope has no coverage data', () => {
    const coverage = writeCoverage({
      [join(repo, 'backend/src/tested.ts')]: fileCoverage([
        [1, 1, 1],
        [2, 2, 1],
      ]),
    });

    const run = runCli(['--coverage', coverage, '--base', 'base', '--scope', 'backend/src', '--threshold', '80']);

    assert.equal(run.status, 1);
    assert.match(run.stdout, /backend\/src\/untested\.ts\s+3\s+0\s+0% !! not in coverage report/);
    assert.match(run.stdout, /backend\/src\/tested\.ts\s+1\s+1\s+100%/);
    assert.doesNotMatch(run.stdout, /frontend/);
    assert.match(run.stderr, /Delta coverage 25% is below the 80% threshold/);
  });

  it('passes when the changed lines are covered and the rest is ignored', () => {
    const coverage = writeCoverage({
      [join(repo, 'backend/src/tested.ts')]: fileCoverage([[2, 2, 1]]),
    });

    const run = runCli([
      '--coverage', coverage, '--base', 'base', '--scope', 'backend/src/',
      '--ignore', 'backend/src/untested.ts',
    ]);

    assert.equal(run.status, 0);
    assert.match(run.stdout, /Delta coverage 100% meets the 80% threshold/);
  });

  it('reports N/A when nothing changed under the scope', () => {
    const coverage = writeCoverage({});

    const run = runCli(['--coverage', coverage, '--base', 'HEAD', '--scope', 'backend/src/']);

    assert.equal(run.status, 0);
    assert.match(run.stdout, /Delta coverage: N\/A/);
  });

  it('fails with an explicit message when the base ref does not exist', () => {
    const coverage = writeCoverage({});

    const run = runCli(['--coverage', coverage, '--base', 'origin/no-such-branch', '--scope', 'backend/src/']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Base ref "origin\/no-such-branch" not found/);
  });

  it('fails when the coverage report does not exist', () => {
    const run = runCli(['--coverage', 'missing.json', '--base', 'base', '--scope', 'backend/src/']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Coverage file not found/);
  });

  it('fails when a required argument is missing', () => {
    const run = runCli(['--coverage', 'coverage-final.json']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Usage:/);
  });

  it('fails on an invalid threshold', () => {
    const run = runCli(['--coverage', 'x.json', '--base', 'base', '--scope', 'backend/src/', '--threshold', 'abc']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Invalid --threshold/);
  });
});
