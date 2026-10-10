/**
 * Pure helpers for the delta coverage check (see delta-coverage.mjs).
 *
 * What is measured: Istanbul "lines" coverage, restricted to the lines a PR
 * adds or modifies. Each statement belongs to its start line only, exactly like
 * the "% Lines" column of the Vitest `text` reporter. Branches are NOT measured
 * here: attributing a branch to a changed line is ambiguous (an `else` added to
 * an existing `if`), and branch coverage is already enforced globally by the
 * Vitest thresholds.
 */

import { posix } from 'node:path';

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const SOURCE_FILE = /\.tsx?$/;
const NON_SOURCE_FILE = /(\.d\.ts|\.(test|spec)\.tsx?)$/;

/**
 * Parses a unified diff (`git diff` output) into the added lines of each file.
 *
 * Deleted files (`+++ /dev/null`) and pure deletions are skipped. Renamed files
 * are keyed by their new path. Blank added lines are skipped: they never hold
 * code, and skipping them keeps files missing from the report from being
 * penalised for empty lines.
 *
 * @param {string} text
 * @returns {Map<string, Set<number>>} repo-relative path -> added line numbers
 */
export function parseUnifiedDiff(text) {
  const changedLines = new Map();
  let currentFile = null;
  let oldRemaining = 0;
  let newRemaining = 0;
  let newLine = 0;

  for (const line of text.split('\n')) {
    // Inside a hunk, the line counts tell us where the body ends. This keeps an
    // added line such as "++ x" (shown as "+++ x") from being read as a header.
    if (oldRemaining > 0 || newRemaining > 0) {
      if (line.startsWith('+')) {
        if (currentFile && line.slice(1).trim() !== '') {
          addLine(changedLines, currentFile, newLine);
        }
        newLine++;
        newRemaining--;
      } else if (line.startsWith('-')) {
        oldRemaining--;
      } else if (line.startsWith(' ')) {
        newLine++;
        oldRemaining--;
        newRemaining--;
      }
      // "\ No newline at end of file" does not count as a line.
      continue;
    }

    if (line.startsWith('diff --git ')) {
      // A pure rename has no "+++" line: never attach its hunks to the previous file.
      currentFile = null;
      continue;
    }

    if (line.startsWith('+++ ')) {
      currentFile = parseNewPath(line.slice(4));
      continue;
    }

    const hunk = line.match(HUNK_HEADER);
    if (hunk) {
      oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLine = Number(hunk[2]);
      newRemaining = hunk[3] === undefined ? 1 : Number(hunk[3]);
    }
  }

  return changedLines;
}

function parseNewPath(header) {
  if (header === '/dev/null') return null;
  return header.startsWith('b/') ? header.slice(2) : header;
}

function addLine(changedLines, file, line) {
  if (!changedLines.has(file)) changedLines.set(file, new Set());
  changedLines.get(file).add(line);
}

/**
 * Istanbul "lines" semantics: each statement is attributed to its start line
 * only, and a line keeps the highest hit count of the statements starting on it.
 * A handler declared at import time (`router.get('/x', async () => { ... })`)
 * therefore covers its first line, not its whole body.
 *
 * @param {{ statementMap: Record<string, { start: { line: number } }>, s: Record<string, number> }} fileCov
 * @returns {Map<number, number>} line number -> hit count (executable lines only)
 */
export function lineCoverage(fileCov) {
  const lines = new Map();
  for (const [id, location] of Object.entries(fileCov.statementMap)) {
    const line = location.start.line;
    const count = fileCov.s[id] ?? 0;
    if (!lines.has(line) || lines.get(line) < count) {
      lines.set(line, count);
    }
  }
  return lines;
}

/**
 * Computes the coverage of the changed lines of the source files under `scope`.
 *
 * A source file under `scope` that is missing from the coverage report counts
 * as 0% (all its non-blank changed lines are uncovered), unless it matches one
 * of the `ignore` globs. Those globs mirror the Vitest `coverage.exclude` lists.
 *
 * @param {object} options
 * @param {Map<string, Set<number>>} options.changedLines repo-relative path -> lines
 * @param {Record<string, object>} options.coverage coverage-final.json content (absolute paths)
 * @param {string} options.root absolute path of the repository root
 * @param {string} options.scope repo-relative folder, e.g. "backend/src/"
 * @param {string[]} [options.ignore] repo-relative globs, e.g. "backend/src/index.ts"
 */
export function computeDelta({ changedLines, coverage, root, scope, ignore = [] }) {
  const coverageByPath = indexCoverageByRelativePath(coverage, root);
  const files = [];

  for (const [file, lines] of changedLines) {
    if (!isInScope(file, scope, ignore)) continue;

    const fileCov = coverageByPath.get(file);
    const result = fileCov
      ? measureCoveredFile(file, lines, fileCov)
      : { file, changed: lines.size, covered: 0, missingFromReport: true };

    if (result.changed > 0) files.push(result);
  }

  const changed = files.reduce((sum, f) => sum + f.changed, 0);
  const covered = files.reduce((sum, f) => sum + f.covered, 0);
  return { files, changed, covered, pct: percentage(covered, changed) };
}

function indexCoverageByRelativePath(coverage, root) {
  const byPath = new Map();
  for (const [absolutePath, fileCov] of Object.entries(coverage)) {
    byPath.set(posix.relative(toPosix(root), toPosix(absolutePath)), fileCov);
  }
  return byPath;
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function isInScope(file, scope, ignore) {
  if (!file.startsWith(scope)) return false;
  if (!SOURCE_FILE.test(file) || NON_SOURCE_FILE.test(file)) return false;
  return !ignore.some((glob) => posix.matchesGlob(file, glob));
}

function measureCoveredFile(file, lines, fileCov) {
  const hits = lineCoverage(fileCov);
  let changed = 0;
  let covered = 0;
  for (const line of lines) {
    // Lines where no statement starts (comments, types, closing braces) do not count.
    if (!hits.has(line)) continue;
    changed++;
    if (hits.get(line) > 0) covered++;
  }
  return { file, changed, covered, missingFromReport: false };
}

/** @returns {number | null} percentage with one decimal, null when nothing was measured */
function percentage(covered, total) {
  if (total === 0) return null;
  return Math.round((covered / total) * 1000) / 10;
}

/**
 * Renders the per-file table, worst files first.
 *
 * @param {ReturnType<typeof computeDelta>} result
 * @param {number} threshold
 * @returns {string}
 */
export function formatReport(result, threshold) {
  const fileWidth = Math.max(50, ...result.files.map((f) => f.file.length + 2));
  const row = (file, changed, covered, pct, flag = '') =>
    file.padEnd(fileWidth) +
    String(changed).padStart(10) +
    String(covered).padStart(10) +
    pct.padStart(10) +
    flag;
  const separator = '-'.repeat(fileWidth + 30);

  const sorted = [...result.files].sort(
    (a, b) => percentage(a.covered, a.changed) - percentage(b.covered, b.changed),
  );
  const lines = [
    `Threshold: ${threshold}%`,
    '',
    row('File', 'Changed', 'Covered', 'Delta %'),
    separator,
  ];
  for (const f of sorted) {
    const pct = percentage(f.covered, f.changed);
    const flag = f.missingFromReport ? ' !! not in coverage report' : pct < threshold ? ' !!' : '';
    lines.push(row(f.file, f.changed, f.covered, `${pct}%`, flag));
  }
  lines.push(separator, row('TOTAL', result.changed, result.covered, `${result.pct}%`));
  return lines.join('\n');
}
