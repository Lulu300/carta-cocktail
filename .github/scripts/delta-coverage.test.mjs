import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  function runCli(args) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf-8' });
  }

  it('fails with an explicit message when the base ref does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delta-coverage-'));
    const coverage = join(dir, 'coverage-final.json');
    writeFileSync(coverage, '{}');
    try {
      const run = runCli([
        '--coverage', coverage,
        '--base', 'refs/heads/no-such-branch-for-delta-coverage',
        '--scope', 'backend/src/',
      ]);

      assert.equal(run.status, 1);
      assert.match(run.stderr, /Base ref "refs\/heads\/no-such-branch-for-delta-coverage" not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a required argument is missing', () => {
    const run = runCli(['--coverage', 'coverage-final.json']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Usage:/);
  });

  it('fails on an invalid threshold', () => {
    const run = runCli(['--coverage', 'x.json', '--base', 'HEAD', '--scope', 'backend/src/', '--threshold', 'abc']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Invalid --threshold/);
  });
});
