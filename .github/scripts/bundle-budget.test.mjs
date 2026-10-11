import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const cli = fileURLToPath(new URL('./bundle-budget.mjs', import.meta.url));

const PUBLIC_MODULES = ['../../src/main.tsx', '../../src/App.tsx', '../../src/pages/public/MenuPublicPage.tsx'];
const VENDOR_MODULES = ['../../node_modules/react/index.js', '../../node_modules/react-dom/client.js'];

describe('bundle-budget.mjs CLI', () => {
  let distDir;

  /** Writes a chunk and its source map (sources are relative to dist/assets, like Vite). */
  function writeChunk(name, { content = `export const ${name.replace(/\W/g, '_')} = 1;\n`, sources }) {
    const path = join(distDir, 'assets', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    if (sources) {
      writeFileSync(`${path}.map`, JSON.stringify({ version: 3, sources, mappings: '' }));
    }
  }

  function writeIndexHtml({ entry = 'index-abc.js', preloads = ['vendor-react-def.js'] } = {}) {
    const preloadLinks = preloads.map((file) => `<link rel="modulepreload" crossorigin href="/assets/${file}">`);
    const html = [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      `    <script type="module" crossorigin src="/assets/${entry}"></script>`,
      ...preloadLinks.map((link) => `    ${link}`),
      '    <link rel="stylesheet" crossorigin href="/assets/index-ghi.css">',
      '  </head>',
      '  <body><div id="root"></div></body>',
      '</html>',
    ].join('\n');
    writeFileSync(join(distDir, 'index.html'), html);
  }

  /** A compliant build: public entry, one vendor preload, and lazy admin chunks that are never preloaded. */
  function writeCompliantBuild() {
    writeIndexHtml();
    writeChunk('index-abc.js', { sources: PUBLIC_MODULES });
    writeChunk('vendor-react-def.js', { sources: VENDOR_MODULES });
    writeChunk('DashboardPage-jkl.js', { sources: ['../../src/pages/admin/DashboardPage.tsx'] });
    writeChunk('jszip.min-mno.js', {
      content: 'var JSZip = function () {};\n',
      sources: ['../../node_modules/jszip/dist/jszip.min.js'],
    });
  }

  function runCli(args) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf-8' });
  }

  beforeEach(() => {
    distDir = join(mkdtempSync(join(tmpdir(), 'bundle-budget-')), 'dist');
    mkdirSync(distDir);
  });

  afterEach(() => {
    rmSync(dirname(distDir), { recursive: true, force: true });
  });

  it('passes and prints the size table when only public code is preloaded', () => {
    writeCompliantBuild();

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /assets\/index-abc\.js \(entry\)/);
    assert.match(run.stdout, /assets\/vendor-react-def\.js \(preload\)/);
    assert.match(run.stdout, /Budget\s+100\.00 kB/);
    assert.match(run.stdout, /within the 100 kB budget/);
    // Lazy chunks and stylesheets are not part of the initial load.
    assert.doesNotMatch(run.stdout, /DashboardPage|jszip|\.css/);
  });

  it('passes when the entry only references the file names of lazy admin and jszip chunks', () => {
    writeCompliantBuild();
    // The entry legitimately holds the paths of its dynamic import() targets.
    const entryContent = [
      'const DashboardPage = lazy(() => import("./DashboardPage-jkl.js"));',
      'const loadZip = () => import("./jszip.min-mno.js");',
    ].join('\n');
    writeChunk('index-abc.js', { content: entryContent, sources: PUBLIC_MODULES });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /within the 100 kB budget/);
  });

  it('fails when an admin page is merged into the entry chunk', () => {
    writeCompliantBuild();
    writeChunk('index-abc.js', { sources: [...PUBLIC_MODULES, '../../src/pages/admin/DashboardPage.tsx'] });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /assets\/index-abc\.js contains src\/pages\/admin\/DashboardPage\.tsx/);
  });

  it('fails when a preloaded chunk holds login, admin layout or import wizard code', () => {
    writeCompliantBuild();
    writeIndexHtml({ preloads: ['vendor-react-def.js', 'shared-pqr.js'] });
    writeChunk('shared-pqr.js', {
      sources: [
        '../../src/pages/auth/LoginPage.tsx',
        '../../src/components/layout/AdminLayout.tsx',
        '../../src/components/import/ImportStepUpload.tsx',
        '../../src/components/layout/PublicLayout.tsx',
      ],
    });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /shared-pqr\.js contains src\/pages\/auth\/LoginPage\.tsx/);
    assert.match(run.stderr, /shared-pqr\.js contains src\/components\/layout\/AdminLayout\.tsx/);
    assert.match(run.stderr, /shared-pqr\.js contains src\/components\/import\/ImportStepUpload\.tsx/);
    assert.doesNotMatch(run.stderr, /PublicLayout/);
  });

  it('fails when the jszip package is statically imported', () => {
    writeCompliantBuild();
    writeChunk('vendor-react-def.js', {
      sources: [...VENDOR_MODULES, '../../node_modules/jszip/dist/jszip.min.js'],
    });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /vendor-react-def\.js contains node_modules\/jszip\/dist\/jszip\.min\.js/);
  });

  it('fails when the text JSZip appears in a preloaded chunk, whatever its source map says', () => {
    writeCompliantBuild();
    writeChunk('index-abc.js', { content: 'const zip = new JSZip();\n', sources: PUBLIC_MODULES });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /assets\/index-abc\.js contains the text "JSZip"/);
  });

  it('fails when the initial load exceeds the budget', () => {
    writeCompliantBuild();
    const entryContent = Array.from({ length: 2000 }, (_, i) => `export const value${i} = ${i * 7919};`).join('\n');
    writeChunk('index-abc.js', { content: entryContent, sources: PUBLIC_MODULES });
    const vendorContent = `export const vendor_react_def_js = 1;\n`;
    const expectedBytes =
      gzipSync(Buffer.from(entryContent), { level: 9 }).length + gzipSync(Buffer.from(vendorContent), { level: 9 }).length;
    const budgetKb = Number(((expectedBytes - 1) / 1000).toFixed(3));

    const run = runCli([distDir, String(budgetKb)]);

    assert.equal(run.status, 1);
    const expectedTotal = `${(expectedBytes / 1000).toFixed(2)} kB`;
    assert.match(run.stdout, new RegExp(`Total\\s+${expectedTotal.replace('.', '\\.')}`));
    assert.match(run.stderr, new RegExp(`Initial load is ${expectedTotal.replace('.', '\\.')} gzip, over the ${budgetKb} kB budget`));
  });

  it('fails with a build hint when a source map is missing', () => {
    writeCompliantBuild();
    rmSync(join(distDir, 'assets', 'vendor-react-def.js.map'));

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Source map not found: .*vendor-react-def\.js\.map\. Build with: npm run build -- --sourcemap hidden/);
  });

  it('fails when index.html has no module entry script', () => {
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><html><head></head><body></body></html>');

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /No <script type="module" src> found in index\.html/);
  });

  it('fails when the dist folder has no index.html', () => {
    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /index\.html not found/);
  });

  it('fails when a preloaded chunk is missing', () => {
    writeCompliantBuild();
    rmSync(join(distDir, 'assets', 'vendor-react-def.js'));

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Chunk not found: .*vendor-react-def\.js/);
  });

  it('rejects missing or invalid arguments', () => {
    const missing = runCli([distDir]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Usage: bundle-budget\.mjs <dist dir> <budget in kB gzip>/);

    const invalid = runCli([distDir, 'abc']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Invalid budget: abc/);
  });
});
