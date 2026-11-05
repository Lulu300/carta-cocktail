import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./css-media-ranges.mjs', import.meta.url));

// What the CSS minifier emits for Safari 16, and for Safari 16.4 (Vite 8's default target).
const LEGACY_CSS =
  '@media (min-width:40rem){.sm\\:flex{display:flex}}@media not all and (min-width:64rem){.max-lg\\:hidden{display:none}}';
const RANGE_CSS =
  '@media (width>=40rem){.sm\\:flex{display:flex}}@media not all and (width>=64rem){.max-lg\\:hidden{display:none}}';

describe('css-media-ranges.mjs CLI', () => {
  let distDir;

  function writeStylesheet(name, content) {
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', name), content);
  }

  function runCli(args) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf-8' });
  }

  beforeEach(() => {
    distDir = join(mkdtempSync(join(tmpdir(), 'css-media-ranges-')), 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(dirname(distDir), { recursive: true, force: true });
  });

  it('passes when every media query uses min-width or max-width', () => {
    writeStylesheet('index-abc.css', LEGACY_CSS);
    writeStylesheet(
      'print-def.css',
      '@media print{.no-print{display:none}}@media (hover:hover){a:hover{color:red}}',
    );

    const run = runCli([distDir]);

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No media query in range syntax in 2 stylesheet\(s\)/);
  });

  it('fails and lists each range query once, with its stylesheet', () => {
    writeStylesheet(
      'index-abc.css',
      `${RANGE_CSS}@media (width>=40rem){.sm\\:block{display:block}}`,
    );

    const run = runCli([distDir]);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /ignored by Safari and iOS before 16\.4/);
    assert.match(run.stderr, /assets\/index-abc\.css: @media \(width>=40rem\)\n/);
    assert.match(run.stderr, /assets\/index-abc\.css: @media not all and \(width>=64rem\)/);
    assert.equal(run.stderr.match(/width>=40rem/g).length, 1);
    assert.match(run.stderr, /Keep build\.target of frontend\/vite\.config\.ts at Safari 16/);
  });

  it('fails on a two-sided range and on unminified CSS', () => {
    writeStylesheet(
      'index-abc.css',
      '@media (40rem <= width < 64rem) {\n  .md-only { display: block; }\n}\n',
    );

    const run = runCli([distDir]);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /@media \(40rem <= width < 64rem\)/);
  });

  it('ignores operators outside media queries', () => {
    writeStylesheet('index-abc.css', '.a[data-x="1"]{width:calc(100% - 1rem)}.b>.c{color:red}');

    const run = runCli([distDir]);

    assert.equal(run.status, 0, run.stderr);
  });

  it('fails when the dist folder has no stylesheet', () => {
    mkdirSync(join(distDir, 'assets'));

    const run = runCli([distDir]);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /No stylesheet found in .*assets/);
  });

  it('fails when the assets folder is missing', () => {
    const run = runCli([distDir]);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /assets folder not found in /);
  });

  it('fails with usage when no dist folder is given', () => {
    const run = runCli([]);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Usage: css-media-ranges\.mjs <dist dir>/);
  });
});
