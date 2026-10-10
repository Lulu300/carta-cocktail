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

import { Buffer } from 'node:buffer';
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

/**
 * Reads the path of a "+++" header. Git appends a TAB when the path contains a
 * space, and quotes it with C escapes when it contains `"`, `\`, control
 * characters or (unless core.quotePath=false) non-ASCII bytes. A path must
 * never be dropped silently: a skipped file would let the gate fail open.
 */
function parseNewPath(header) {
  const raw = header.endsWith('\t') ? header.slice(0, -1) : header;
  if (raw === '/dev/null') return null;
  const path = raw.startsWith('"') ? decodeQuotedPath(raw) : raw;
  return path.startsWith('b/') ? path.slice(2) : path;
}

const C_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** Decodes a git C-quoted path such as "b/caf\303\251.ts" (octal escapes are UTF-8 bytes). */
function decodeQuotedPath(quoted) {
  if (quoted.length < 2 || !quoted.endsWith('"')) {
    throw new Error(`Cannot parse quoted path in diff header: ${quoted}`);
  }
  // Code points, not UTF-16 units: with core.quotePath=false, non-ASCII stays raw.
  const chars = Array.from(quoted.slice(1, -1));
  const bytes = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '\\') {
      bytes.push(...Buffer.from(chars[i], 'utf-8'));
      continue;
    }
    const octal = chars.slice(i + 1, i + 4).join('');
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8));
      i += 3;
    } else if (Object.hasOwn(C_ESCAPES, chars[i + 1])) {
      bytes.push(C_ESCAPES[chars[i + 1]]);
      i += 1;
    } else {
      throw new Error(`Cannot parse quoted path in diff header: ${quoted}`);
    }
  }
  return Buffer.from(bytes).toString('utf-8');
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
 * @param {string} options.scope repo-relative folder, e.g. "backend/src/" (trailing slash optional)
 * @param {string[]} [options.ignore] repo-relative globs, e.g. "backend/src/index.ts"
 */
export function computeDelta({ changedLines, coverage, root, scope, ignore = [] }) {
  const coverageByPath = indexCoverageByRelativePath(coverage, root);
  const scopePrefix = toFolderPrefix(scope);
  const files = [];

  for (const [file, lines] of changedLines) {
    if (!isInScope(file, scopePrefix, ignore)) continue;

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

// The scope is matched as a path prefix, so "backend/src" must not match "backend/srcx/".
function toFolderPrefix(scope) {
  return scope === '' || scope.endsWith('/') ? scope : `${scope}/`;
}

function isInScope(file, scopePrefix, ignore) {
  if (!file.startsWith(scopePrefix)) return false;
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

/**
 * Display only: percentage rounded down to one decimal, null when nothing was
 * measured. Rounded down so a failing run never prints "80% is below 80%"
 * (399/499 = 79.96% shows as 79.9%). Use meetsThreshold for the decision.
 */
function percentage(covered, total) {
  if (total === 0) return null;
  // Integer arithmetic first: Math.floor on a float product can lose a unit.
  return Math.floor((covered * 1000) / total) / 10;
}

/**
 * Compares the exact ratio with the threshold, without rounding.
 *
 * @param {{ covered: number, changed: number }} counts
 * @param {number} threshold percentage, e.g. 80
 */
export function meetsThreshold({ covered, changed }, threshold) {
  return covered * 100 >= threshold * changed;
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

  const sorted = [...result.files].sort((a, b) => a.covered / a.changed - b.covered / b.changed);
  const lines = [
    `Threshold: ${threshold}%`,
    '',
    row('File', 'Changed', 'Covered', 'Delta %'),
    separator,
  ];
  for (const f of sorted) {
    let flag = '';
    if (f.missingFromReport) flag = ' !! not in coverage report';
    else if (!meetsThreshold(f, threshold)) flag = ' !!';
    lines.push(row(f.file, f.changed, f.covered, `${percentage(f.covered, f.changed)}%`, flag));
  }
  lines.push(separator, row('TOTAL', result.changed, result.covered, `${result.pct}%`));
  return lines.join('\n');
}
