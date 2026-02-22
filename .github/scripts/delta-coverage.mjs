#!/usr/bin/env node

/**
 * Delta Coverage Check
 *
 * Compares coverage data (coverage-final.json) against the git diff
 * to ensure that new/modified lines in a PR meet a minimum coverage threshold.
 *
 * Usage:
 *   node delta-coverage.mjs <coverage-json-path> <threshold> [base-ref]
 *
 * Example:
 *   node delta-coverage.mjs frontend/coverage/coverage-final.json 80 origin/main
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, relative } from 'path';

const [coveragePath, thresholdStr = '80', baseRef = 'origin/main'] = process.argv.slice(2);

if (!coveragePath) {
  console.error('Usage: delta-coverage.mjs <coverage-json-path> <threshold> [base-ref]');
  process.exit(1);
}

const THRESHOLD = Number(thresholdStr);
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

// ── Load coverage data ──────────────────────────────────────────────
const absPath = resolve(coveragePath);
if (!existsSync(absPath)) {
  console.error(`Coverage file not found: ${absPath}`);
  process.exit(1);
}

const coverage = JSON.parse(readFileSync(absPath, 'utf-8'));

// ── Get changed lines from git diff ────────────────────────────────
function getChangedLines() {
  // --unified=0 gives us only the changed lines with no context
  // --diff-filter=ACMR excludes deleted files
  let diff;
  try {
    diff = execSync(
      `git diff --unified=0 --diff-filter=ACMR ${baseRef}...HEAD -- '*.ts' '*.tsx'`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    // If the base ref doesn't exist (first PR), compare against HEAD~1
    try {
      diff = execSync(
        `git diff --unified=0 --diff-filter=ACMR HEAD~1...HEAD -- '*.ts' '*.tsx'`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch {
      console.log('No base commit to compare against. Skipping delta coverage.');
      process.exit(0);
    }
  }

  // Parse unified diff to extract file paths and added line numbers
  const changedLines = new Map(); // filePath -> Set<lineNumber>
  let currentFile = null;

  for (const line of diff.split('\n')) {
    // Match file header: +++ b/frontend/src/foo.ts
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Match hunk header: @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ .+ \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      const start = Number(hunkMatch[1]);
      const count = hunkMatch[2] !== undefined ? Number(hunkMatch[2]) : 1;
      if (count === 0) continue; // Pure deletion hunk

      if (!changedLines.has(currentFile)) {
        changedLines.set(currentFile, new Set());
      }
      const lines = changedLines.get(currentFile);
      for (let i = start; i < start + count; i++) {
        lines.add(i);
      }
    }
  }

  return changedLines;
}

// ── Check coverage for changed lines ────────────────────────────────
const changedLines = getChangedLines();

if (changedLines.size === 0) {
  console.log('No changed source files detected. Delta coverage: N/A');
  process.exit(0);
}

// Build a map of coverage file paths (coverage JSON uses absolute paths)
const coverageByRelPath = new Map();
for (const [absFilePath, fileCov] of Object.entries(coverage)) {
  const rel = relative(ROOT, absFilePath);
  coverageByRelPath.set(rel, fileCov);
}

let totalChanged = 0;
let totalCovered = 0;
const fileResults = [];

for (const [filePath, lineNumbers] of changedLines) {
  // Skip test files
  if (filePath.includes('.test.') || filePath.includes('/test/')) continue;

  const fileCov = coverageByRelPath.get(filePath);
  if (!fileCov) {
    // File has no coverage data (might be excluded from coverage)
    continue;
  }

  // Build a set of covered lines from statement map
  const coveredLines = new Set();
  const { statementMap, s } = fileCov;

  for (const [stmtId, loc] of Object.entries(statementMap)) {
    const count = s[stmtId];
    if (count > 0) {
      for (let line = loc.start.line; line <= loc.end.line; line++) {
        coveredLines.add(line);
      }
    }
  }

  // Count changed lines that are covered
  let fileTotalChanged = 0;
  let fileTotalCovered = 0;

  for (const line of lineNumbers) {
    // Only count lines that exist in statement map (skip comments, blank lines, imports)
    const isExecutable = Object.values(statementMap).some(
      loc => line >= loc.start.line && line <= loc.end.line
    );
    if (!isExecutable) continue;

    fileTotalChanged++;
    if (coveredLines.has(line)) {
      fileTotalCovered++;
    }
  }

  if (fileTotalChanged > 0) {
    const pct = ((fileTotalCovered / fileTotalChanged) * 100).toFixed(1);
    fileResults.push({
      file: filePath,
      changed: fileTotalChanged,
      covered: fileTotalCovered,
      pct: Number(pct),
    });
    totalChanged += fileTotalChanged;
    totalCovered += fileTotalCovered;
  }
}

// ── Report ──────────────────────────────────────────────────────────
if (totalChanged === 0) {
  console.log('No executable changed lines found in coverage scope. Delta coverage: N/A');
  process.exit(0);
}

const overallPct = ((totalCovered / totalChanged) * 100).toFixed(1);

console.log('\n=== Delta Coverage Report ===\n');
console.log(`Threshold: ${THRESHOLD}%\n`);

// Sort by coverage ascending (worst first)
fileResults.sort((a, b) => a.pct - b.pct);

const COL_FILE = 50;
const COL_NUM = 10;

console.log(
  'File'.padEnd(COL_FILE) +
  'Changed'.padStart(COL_NUM) +
  'Covered'.padStart(COL_NUM) +
  'Delta %'.padStart(COL_NUM)
);
console.log('-'.repeat(COL_FILE + COL_NUM * 3));

for (const r of fileResults) {
  const status = r.pct >= THRESHOLD ? ' ' : ' !!';
  console.log(
    r.file.padEnd(COL_FILE) +
    String(r.changed).padStart(COL_NUM) +
    String(r.covered).padStart(COL_NUM) +
    `${r.pct}%`.padStart(COL_NUM) +
    status
  );
}

console.log('-'.repeat(COL_FILE + COL_NUM * 3));
console.log(
  'TOTAL'.padEnd(COL_FILE) +
  String(totalChanged).padStart(COL_NUM) +
  String(totalCovered).padStart(COL_NUM) +
  `${overallPct}%`.padStart(COL_NUM)
);

console.log('');

if (Number(overallPct) < THRESHOLD) {
  console.error(
    `Delta coverage ${overallPct}% is below the ${THRESHOLD}% threshold.`
  );
  process.exit(1);
} else {
  console.log(`Delta coverage ${overallPct}% meets the ${THRESHOLD}% threshold.`);
}
