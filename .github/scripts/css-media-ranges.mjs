#!/usr/bin/env node

/**
 * CSS Media Range Check
 *
 * Fails when a built stylesheet still holds a media query in range syntax
 * (`@media (width>=40rem)`). Safari and iOS before 16.4 do not understand it and
 * drop the whole rule: every sm:, md: and lg: style of Tailwind is lost there.
 * The `build.target` of frontend/vite.config.ts (Safari 16) makes the CSS
 * minifier rewrite these queries as `min-width`/`max-width`; this check catches
 * a build that stops doing so (target removed, plugin or minifier change).
 *
 * Usage:
 *   node css-media-ranges.mjs <dist dir>
 *
 * Example (from the frontend folder):
 *   node ../.github/scripts/css-media-ranges.mjs dist
 *
 * Exit codes: 0 when no stylesheet has a range query, 1 otherwise (or when the
 * dist folder has no stylesheet, or on bad arguments).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// A media condition with a comparison operator: (width>=40rem), (40rem<=width<64rem).
// The legacy form only uses a colon: (min-width:40rem).
const RANGE_MEDIA_QUERY = /@media[^{;]*\([^()]*[<>=][^()]*\)[^{;]*/gi;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readDistDir() {
  const [distArg] = process.argv.slice(2);
  if (!distArg) fail('Usage: css-media-ranges.mjs <dist dir>');
  return resolve(distArg);
}

function stylesheets(distDir) {
  const assetsDir = join(distDir, 'assets');
  if (!existsSync(assetsDir)) throw new Error(`assets folder not found in ${distDir}`);
  const files = readdirSync(assetsDir).filter((name) => name.endsWith('.css'));
  if (files.length === 0) throw new Error(`No stylesheet found in ${assetsDir}`);
  return files.map((name) => ({
    path: `assets/${name}`,
    content: readFileSync(join(assetsDir, name), 'utf-8'),
  }));
}

function main() {
  const distDir = readDistDir();
  const sheets = stylesheets(distDir);
  const violations = sheets.flatMap((sheet) =>
    [...new Set(sheet.content.match(RANGE_MEDIA_QUERY) ?? [])].map(
      (query) => `${sheet.path}: ${query.trim()}`,
    ),
  );
  if (violations.length > 0) {
    fail(
      [
        'Media queries in range syntax, ignored by Safari and iOS before 16.4:',
        ...violations,
        'Keep build.target of frontend/vite.config.ts at Safari 16 so the minifier rewrites them.',
      ].join('\n'),
    );
  }
  console.log(`No media query in range syntax in ${sheets.length} stylesheet(s).`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
