#!/usr/bin/env node

/**
 * Bundle Budget Check
 *
 * Guards the JavaScript a guest downloads before the first navigation (the
 * public menu opened from a QR code): the entry script of index.html plus its
 * <link rel="modulepreload"> chunks. Fails when:
 *   - one of these chunks contains admin, login or import wizard code, the admin
 *     messages, or jszip;
 *   - one of these chunks contains the text "JSZip" (safety net);
 *   - their total gzip size exceeds the budget.
 *
 * Which source modules ended up in a chunk is read from its source map. The
 * Vite manifest is not enough: it lists chunks, not modules, so a page imported
 * statically and merged into the entry chunk leaves no trace in it. Build with
 * hidden source maps, which do not change the emitted JavaScript:
 *   npm run build -- --sourcemap hidden
 *
 * Usage:
 *   node bundle-budget.mjs <dist dir> <budget in kB gzip>
 *
 * Example (from the frontend folder):
 *   node ../.github/scripts/bundle-budget.mjs dist 133
 *
 * Sizes use 1 kB = 1000 bytes and gzip level 9, close to what `vite build` prints.
 * Exit codes: 0 when the budget is met, 1 on failure (violation, missing file,
 * bad arguments).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

// Paths are relative to the frontend folder (the parent of the dist folder).
// A trailing slash matches a whole folder, otherwise the exact file.
const FORBIDDEN_MODULES = [
  'src/pages/admin/',
  'src/pages/auth/',
  'src/components/layout/AdminLayout.tsx',
  'src/components/import/',
  'src/i18n/admin.ts',
  'src/i18n/locales/admin/',
  'node_modules/jszip/',
];

const FORBIDDEN_TEXT = 'JSZip';

// Rolldown's CJS interop helpers: generated code only, emitted without a source map.
const GENERATED_CHUNK = /^assets\/rolldown-runtime-[\w-]+\.js$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readArguments() {
  const [distArg, budgetArg] = process.argv.slice(2);
  if (!distArg || !budgetArg) {
    fail('Usage: bundle-budget.mjs <dist dir> <budget in kB gzip>');
  }
  const budgetKb = Number(budgetArg);
  if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
    fail(`Invalid budget: ${budgetArg}`);
  }
  return { distDir: resolve(distArg), budgetKb };
}

/** Returns the attributes of every `<tagName ...>` opening tag in the HTML. */
function findTags(html, tagName) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
  return tags.map((tag) => {
    const attributes = {};
    for (const [, name, value] of tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      attributes[name.toLowerCase()] = value ?? '';
    }
    return attributes;
  });
}

/**
 * Lists the chunks index.html loads before the first navigation: the module
 * entry script first, then the modulepreload links, as dist-relative paths.
 *
 * Assumes Vite's default `build.modulePreload`: one link per chunk the entry
 * imports statically, transitively. If modulePreload were disabled, those
 * chunks would have no link and this check would skip them without warning.
 */
function initialChunks(distDir) {
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) throw new Error(`index.html not found in ${distDir}`);
  const html = readFileSync(indexPath, 'utf-8');

  const entries = findTags(html, 'script')
    .filter((script) => script.type === 'module' && script.src)
    .map((script) => script.src);
  if (entries.length === 0) throw new Error('No <script type="module" src> found in index.html');

  const preloads = findTags(html, 'link')
    .filter((link) => link.rel === 'modulepreload' && link.href)
    .map((link) => link.href);

  return [
    ...entries.map((url) => ({ path: url.replace(/^\//, ''), role: 'entry' })),
    ...preloads.map((url) => ({ path: url.replace(/^\//, ''), role: 'preload' })),
  ];
}

/**
 * Source modules of a chunk, relative to the frontend folder, from its source map.
 *
 * Every chunk needs its map, except Rolldown's runtime chunk (GENERATED_CHUNK): it
 * holds no source module, so Rolldown emits no map for it. The text check still
 * applies to it.
 */
function chunkModules(distDir, chunk) {
  const mapPath = join(distDir, `${chunk.path}.map`);
  if (!existsSync(mapPath)) {
    if (GENERATED_CHUNK.test(chunk.path)) return [];
    throw new Error(`Source map not found: ${mapPath}. Build with: npm run build -- --sourcemap hidden`);
  }
  const map = JSON.parse(readFileSync(mapPath, 'utf-8'));
  const sourceDir = resolve(dirname(mapPath), map.sourceRoot ?? '');
  const projectDir = dirname(distDir);
  return map.sources.map((source) => relative(projectDir, resolve(sourceDir, source)).split(sep).join('/'));
}

function isForbiddenModule(modulePath) {
  return FORBIDDEN_MODULES.some((forbidden) =>
    forbidden.endsWith('/') ? modulePath.startsWith(forbidden) : modulePath === forbidden,
  );
}

function inspectChunk(distDir, chunk) {
  const filePath = join(distDir, chunk.path);
  if (!existsSync(filePath)) throw new Error(`Chunk not found: ${filePath}`);
  const content = readFileSync(filePath);
  return {
    ...chunk,
    rawBytes: content.length,
    gzipBytes: gzipSync(content, { level: 9 }).length,
    forbiddenModules: chunkModules(distDir, chunk).filter(isForbiddenModule),
    hasForbiddenText: content.includes(FORBIDDEN_TEXT),
  };
}

function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function formatTable(chunks, totalGzipBytes, budgetKb) {
  const rows = chunks.map((chunk) => [`${chunk.path} (${chunk.role})`, formatKb(chunk.rawBytes), formatKb(chunk.gzipBytes)]);
  rows.push(['Total', '', formatKb(totalGzipBytes)]);
  rows.push(['Budget', '', `${budgetKb.toFixed(2)} kB`]);
  const header = ['File', 'Raw', 'Gzip'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  return [header, ...rows]
    .map(([file, raw, gzip]) => `${file.padEnd(widths[0])}  ${raw.padStart(widths[1])}  ${gzip.padStart(widths[2])}`)
    .join('\n');
}

function findViolations(chunks, totalGzipBytes, budgetKb) {
  const violations = [];
  for (const chunk of chunks) {
    for (const modulePath of chunk.forbiddenModules) {
      violations.push(`${chunk.path} contains ${modulePath}: load it with a dynamic import() instead.`);
    }
    if (chunk.hasForbiddenText) {
      violations.push(`${chunk.path} contains the text "${FORBIDDEN_TEXT}": jszip must stay out of the initial load.`);
    }
  }
  if (totalGzipBytes > budgetKb * 1000) {
    violations.push(`Initial load is ${formatKb(totalGzipBytes)} gzip, over the ${budgetKb} kB budget.`);
  }
  return violations;
}

function main() {
  const { distDir, budgetKb } = readArguments();
  const chunks = initialChunks(distDir).map((chunk) => inspectChunk(distDir, chunk));
  const totalGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);

  console.log('\n=== Bundle Budget: JavaScript loaded before the first navigation ===\n');
  console.log(formatTable(chunks, totalGzipBytes, budgetKb));
  console.log('');

  const violations = findViolations(chunks, totalGzipBytes, budgetKb);
  if (violations.length > 0) {
    fail(violations.join('\n'));
  }
  console.log(`Initial load ${formatKb(totalGzipBytes)} gzip is within the ${budgetKb} kB budget.`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
