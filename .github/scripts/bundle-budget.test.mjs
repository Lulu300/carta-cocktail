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

  const PRECACHED_FILES = ['index.html', 'manifest.webmanifest', 'theme-init.js', 'assets/index-abc.js', 'assets/vendor-react-def.js'];

  /** sw.js as vite-plugin-pwa writes it (minified Workbox), precaching these dist-relative paths. */
  function writeServiceWorker(urls = PRECACHED_FILES) {
    const entries = urls.map((url) => `{url:"${url}",revision:${url.startsWith('assets/') ? 'null' : '"5ea4"'}}`);
    const sw = [
      'define(["./workbox-c416"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),',
      `e.precacheAndRoute([${entries.join(',')}],{}),`,
      'e.registerRoute(({url:e,sameOrigin:s})=>s&&e.pathname.startsWith("/uploads/"),new e.CacheFirst,"GET")}));',
    ].join('');
    writeFileSync(join(distDir, 'sw.js'), sw);
  }

  /**
   * A compliant build: public entry, one vendor preload, lazy admin chunks that are never
   * preloaded, and a service worker that precaches the initial load and a lazy public chunk.
   */
  function writeCompliantBuild() {
    writeIndexHtml();
    writeServiceWorker([...PRECACHED_FILES, 'assets/registerServiceWorker-vwx.js']);
    writeChunk('registerServiceWorker-vwx.js', { sources: ['../../src/pwa/registerServiceWorker.ts'] });
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
    assert.match(run.stdout, /The sw\.js precache \(6 files\) holds the initial load and no admin code/);
    // Lazy chunks and stylesheets are not part of the initial load.
    assert.doesNotMatch(run.stdout, /DashboardPage|jszip|registerServiceWorker|\.css/);
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

  it('fails when a preloaded chunk holds the admin messages', () => {
    writeCompliantBuild();
    writeChunk('index-abc.js', {
      sources: [
        ...PUBLIC_MODULES,
        '../../src/i18n/admin.ts',
        '../../src/i18n/locales/admin/en.json',
        '../../src/i18n/locales/public/en.json',
      ],
    });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /index-abc\.js contains src\/i18n\/admin\.ts/);
    assert.match(run.stderr, /index-abc\.js contains src\/i18n\/locales\/admin\/en\.json/);
    assert.doesNotMatch(run.stderr, /locales\/public/);
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

  it('fails with a build hint when the entry source map is missing', () => {
    writeCompliantBuild();
    rmSync(join(distDir, 'assets', 'index-abc.js.map'));

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Source map not found: .*index-abc\.js\.map\. Build with: npm run build -- --sourcemap hidden/);
  });

  it('fails with a build hint when a preloaded chunk of source code has no source map', () => {
    writeCompliantBuild();
    writeIndexHtml({ preloads: ['vendor-react-def.js', 'api-xyz.js'] });
    writeChunk('api-xyz.js', { content: 'export const api = {};\n' });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /Source map not found: .*api-xyz\.js\.map\. Build with: npm run build -- --sourcemap hidden/);
  });

  it('accepts the Rolldown runtime chunk without source map, as generated code', () => {
    writeCompliantBuild();
    writeIndexHtml({ preloads: ['rolldown-runtime-stu.js', 'vendor-react-def.js'] });
    writeServiceWorker([...PRECACHED_FILES, 'assets/rolldown-runtime-stu.js']);
    writeChunk('rolldown-runtime-stu.js', { content: 'var e=Object.create;export{e as t};\n' });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /assets\/rolldown-runtime-stu\.js \(preload\)/);
  });

  it('still applies the text check to the Rolldown runtime chunk', () => {
    writeCompliantBuild();
    writeIndexHtml({ preloads: ['rolldown-runtime-stu.js', 'vendor-react-def.js'] });
    writeChunk('rolldown-runtime-stu.js', { content: 'const zip = new JSZip();\n' });

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /assets\/rolldown-runtime-stu\.js contains the text "JSZip"/);
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

  it('fails when the service worker precaches an admin chunk', () => {
    writeCompliantBuild();
    writeServiceWorker([...PRECACHED_FILES, 'assets/DashboardPage-jkl.js']);

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(
      run.stderr,
      /assets\/DashboardPage-jkl\.js contains src\/pages\/admin\/DashboardPage\.tsx: keep it out of the precache/,
    );
  });

  it('fails when the service worker precaches jszip', () => {
    writeCompliantBuild();
    writeServiceWorker([...PRECACHED_FILES, 'assets/jszip.min-mno.js']);

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /jszip\.min-mno\.js contains node_modules\/jszip\/dist\/jszip\.min\.js: keep it out of the precache/);
    assert.match(run.stderr, /jszip\.min-mno\.js contains the text "JSZip": jszip must stay out of the precache/);
  });

  it('fails when the precache misses the page, the web manifest, the theme script or a chunk of the initial load', () => {
    writeCompliantBuild();
    writeServiceWorker(['assets/index-abc.js']);

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /sw\.js does not precache index\.html: the menu would not open offline/);
    assert.match(run.stderr, /sw\.js does not precache manifest\.webmanifest/);
    assert.match(run.stderr, /sw\.js does not precache theme-init\.js/);
    assert.match(run.stderr, /sw\.js does not precache assets\/vendor-react-def\.js/);
    assert.doesNotMatch(run.stderr, /does not precache assets\/index-abc\.js/);
  });

  it('fails when the build has no service worker', () => {
    writeCompliantBuild();
    rmSync(join(distDir, 'sw.js'));

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /sw\.js not found/);
  });

  it('fails when sw.js has no precache list', () => {
    writeCompliantBuild();
    writeFileSync(join(distDir, 'sw.js'), 'self.addEventListener("fetch", () => {});\n');

    const run = runCli([distDir, '100']);

    assert.equal(run.status, 1);
    assert.match(run.stderr, /No precacheAndRoute\(\[\.\.\.\]\) call found in sw\.js/);
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
