#!/usr/bin/env node

/**
 * Delta Coverage Check
 *
 * Fails when less than `--threshold` percent of the lines added or modified
 * since `--base` are covered by tests. Only lines are measured (Istanbul
 * "lines" semantics), not branches: see delta-coverage-lib.mjs.
 *
 * Usage:
 *   node delta-coverage.mjs --coverage <coverage-final.json> --threshold 80 \
 *     --base <git ref> --scope <repo-relative folder> [--ignore <glob>]...
 *
 * Example (from the backend folder):
 *   node ../.github/scripts/delta-coverage.mjs --coverage coverage/coverage-final.json \
 *     --threshold 80 --base origin/develop --scope backend/src/ --ignore 'backend/src/index.ts'
 *
 * Exit codes: 0 when the threshold is met or nothing measurable changed,
 * 1 on failure (threshold missed, missing base ref, missing report, bad arguments).
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseUnifiedDiff, computeDelta, formatReport } from './delta-coverage-lib.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
}

function readOptions() {
  const { values } = parseArgs({
    options: {
      coverage: { type: 'string' },
      threshold: { type: 'string', default: '80' },
      base: { type: 'string' },
      scope: { type: 'string' },
      ignore: { type: 'string', multiple: true, default: [] },
    },
  });
  if (!values.coverage || !values.base || !values.scope) {
    fail('Usage: delta-coverage.mjs --coverage <path> --threshold <pct> --base <ref> --scope <dir> [--ignore <glob>]...');
  }
  const threshold = Number(values.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    fail(`Invalid --threshold: ${values.threshold}`);
  }
  // The scope is matched as a path prefix, so "backend/src" must not match "backend/srcx/".
  const scope = values.scope.endsWith('/') ? values.scope : `${values.scope}/`;
  return { ...values, threshold, scope };
}

function assertBaseExists(base) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  } catch {
    fail(
      `Base ref "${base}" not found. Fetch it first (actions/checkout needs fetch-depth: 0). ` +
        'Delta coverage cannot be computed without a base, so the check fails.',
    );
  }
}

function changedLinesSince(base, scope, root) {
  // Fixed prefixes so a user's diff.noprefix / diff.mnemonicPrefix config cannot break parsing.
  const diff = execFileSync(
    'git',
    [
      'diff', '--unified=0', '--no-color', '--no-ext-diff', '--find-renames',
      '--src-prefix=a/', '--dst-prefix=b/', '--diff-filter=ACMR',
      `${base}...HEAD`, '--', scope,
    ],
    { cwd: root, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
  );
  return parseUnifiedDiff(diff);
}

function main() {
  const options = readOptions();
  const root = git(['rev-parse', '--show-toplevel']).trim();

  const coveragePath = resolve(options.coverage);
  if (!existsSync(coveragePath)) fail(`Coverage file not found: ${coveragePath}`);
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf-8'));

  assertBaseExists(options.base);
  const changedLines = changedLinesSince(options.base, options.scope, root);
  const result = computeDelta({
    changedLines,
    coverage,
    root,
    scope: options.scope,
    ignore: options.ignore,
  });

  if (result.pct === null) {
    console.log(`No executable changed lines under ${options.scope}. Delta coverage: N/A`);
    return;
  }

  console.log('\n=== Delta Coverage Report ===\n');
  console.log(formatReport(result, options.threshold));
  console.log('');

  if (result.pct < options.threshold) {
    fail(`Delta coverage ${result.pct}% is below the ${options.threshold}% threshold.`);
  }
  console.log(`Delta coverage ${result.pct}% meets the ${options.threshold}% threshold.`);
}

main();
