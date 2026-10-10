#!/usr/bin/env node
// Upgrade test bench: replays version upgrades on a copy of a real database with Docker.
// No dependency: node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend --path 1.4.0,1.5.0
// See scripts/upgrade-test/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BenchRun } from './lib/bench.mjs';
import {
  buildImage, ensureHelperImage, pullImage, remoteDigest, removeResources, RESOURCE_PREFIX, serverPlatform,
} from './lib/docker.mjs';
import { renderReport } from './lib/report.mjs';
import { latestHookVersion, parseUpgradePath } from './lib/versions.mjs';

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(BENCH_DIR, '../..');
const REGISTRY = 'ghcr.io/lulu300/carta-cocktail';
// Published images are amd64 only; Docker emulates them on other hosts.
const PUBLISHED_PLATFORM = 'linux/amd64';
const LOCAL_IMAGE = 'carta-upgrade-test';
const MODES = ['naive', 'conformant'];
const EXIT_UNEXPECTED_FAILURE = 1;
// Wrong arguments, missing fixture, image not found: no report is written.
const EXIT_SETUP_ERROR = 2;

const USAGE = `Usage: node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend|official --path <v1,v2,...>
  --fixture <dir>        folder with carta_cocktail.db and uploads.tgz (never modified)
  --layout <name>        friend or official (scripts/upgrade-test/layouts/)
  --path <list>          versions in order, e.g. 1.4.0,1.5.0,1.6.0-rc.1; "local" builds the checkout
  --mode <mode>          naive, conformant or both (default both)
  --local-version <v>    release notes followed by the "local" step (default: newest hook file)
  --report-dir <dir>     default <fixture>/../upgrade-test-reports/<date>/
  --timeout <seconds>    wait for each backend start (default 300)
  --keep                 keep the containers, volumes and work folder of a failed run
  --clean-all            remove every resource left by earlier runs (${RESOURCE_PREFIX}*) and exit`;

function parseCli() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      layout: { type: 'string' },
      path: { type: 'string' },
      mode: { type: 'string', default: 'both' },
      'local-version': { type: 'string' },
      'report-dir': { type: 'string' },
      timeout: { type: 'string', default: '300' },
      keep: { type: 'boolean', default: false },
      'clean-all': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  return values;
}

async function loadHookFiles() {
  const dir = path.join(BENCH_DIR, 'hooks');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.mjs'));
  return Promise.all(files.map(async (file) => (await import(pathToFileURL(path.join(dir, file)))).default));
}

async function loadLayout(name) {
  const layoutDir = path.join(BENCH_DIR, 'layouts', name);
  if (!/^[a-z0-9-]+$/.test(name ?? '') || !fs.existsSync(path.join(layoutDir, 'layout.mjs'))) {
    throw new Error(`Unknown layout "${name}": ${fs.readdirSync(path.join(BENCH_DIR, 'layouts')).join(', ')}`);
  }
  return { layout: (await import(pathToFileURL(path.join(layoutDir, 'layout.mjs')))).default, layoutDir };
}

function checkFixture(fixtureDir) {
  for (const file of ['carta_cocktail.db', 'uploads.tgz']) {
    if (!fs.existsSync(path.join(fixtureDir, file))) throw new Error(`Missing ${file} in ${fixtureDir}`);
  }
}

/** Published backend image of a version; the tag of a pinned version must match its digest. */
function publishedBackendImage(version, hookFiles) {
  const tagRef = `${REGISTRY}/backend:${version}`;
  const pinned = hookFiles.find((hooks) => hooks.version === version)?.backendDigest;
  const digest = remoteDigest(tagRef);
  if (!pinned) {
    if (!digest) throw new Error(`${tagRef} does not exist`);
    return { ref: tagRef, note: digest };
  }
  if (digest === pinned) return { ref: tagRef, note: `tag matches the pinned digest ${pinned.slice(0, 19)}…` };
  return { ref: `${REGISTRY}/backend@${pinned}`, note: `tag ${digest ? 'moved' : 'missing'}: pinned digest used` };
}

function resolveImages(steps, hookFiles) {
  const images = {};
  for (const step of steps) {
    if (step.local) {
      console.log('Building the backend and frontend images from the checkout…');
      buildImage(`${LOCAL_IMAGE}/backend:local`, path.join(REPO_ROOT, 'backend'));
      buildImage(`${LOCAL_IMAGE}/frontend:local`, path.join(REPO_ROOT, 'frontend'));
      images[step.label] = {
        backend: `${LOCAL_IMAGE}/backend:local`,
        frontend: `${LOCAL_IMAGE}/frontend:local`,
        platform: serverPlatform(),
        note: `built from the checkout, follows the v${step.version} notes`,
      };
      continue;
    }
    const backend = publishedBackendImage(step.version, hookFiles);
    const frontend = `${REGISTRY}/frontend:${step.version}`;
    console.log(`Pulling ${step.label} (${PUBLISHED_PLATFORM})…`);
    pullImage(backend.ref, PUBLISHED_PLATFORM);
    pullImage(frontend, PUBLISHED_PLATFORM);
    images[step.label] = { backend: backend.ref, frontend, platform: PUBLISHED_PLATFORM, note: backend.note };
  }
  return images;
}

function defaultReportDir(fixtureDir, now) {
  return path.resolve(fixtureDir, '..', 'upgrade-test-reports', now.toISOString().slice(0, 10));
}

function runId(now) {
  return now.toISOString().replace(/[-:T]/g, '').slice(2, 14);
}

async function main() {
  const options = parseCli();
  if (options.help) return console.log(USAGE);
  if (options['clean-all']) {
    const removed = removeResources(RESOURCE_PREFIX);
    return console.log(`Removed ${removed.containers} containers, ${removed.volumes} volumes, ${removed.networks} networks.`);
  }
  if (!options.fixture || !options.layout || !options.path) throw new Error(USAGE);
  const modes = options.mode === 'both' ? MODES : [options.mode];
  if (!modes.every((mode) => MODES.includes(mode))) throw new Error('--mode must be naive, conformant or both');

  const fixtureDir = path.resolve(options.fixture);
  checkFixture(fixtureDir);
  const { layout, layoutDir } = await loadLayout(options.layout);
  const hookFiles = await loadHookFiles();
  const steps = parseUpgradePath(options.path, options['local-version'] ?? latestHookVersion(hookFiles));
  const now = new Date();

  ensureHelperImage();
  const images = resolveImages(steps, hookFiles);
  const runs = [];
  for (const mode of modes) {
    const bench = new BenchRun({
      fixtureDir, layout, layoutDir, mode, steps, images, hookFiles,
      runId: runId(now), timeoutMs: Number(options.timeout) * 1000,
    });
    runs.push({ ...await bench.execute({ keep: options.keep }), failed: bench.hasFailed() });
  }

  const reportDir = path.resolve(options['report-dir'] ?? defaultReportDir(fixtureDir, now));
  fs.mkdirSync(reportDir, { recursive: true });
  const reportName = `${layout.name}_${steps.map((step) => step.label).join('_')}_${now.toISOString().slice(11, 19).replaceAll(':', '')}.md`;
  const reportPath = path.join(reportDir, reportName);
  fs.writeFileSync(reportPath, renderReport({
    generatedAt: now.toISOString(), layout, pathLabels: steps.map((step) => step.label), images, runs,
  }));
  console.log(`Report: ${reportPath}`);
  for (const run of runs) console.log(`${run.mode}: ${run.failed ? 'KO' : 'OK'}${run.kept ? ` (kept: ${run.kept.workDir})` : ''}`);
  if (runs.some((run) => run.failed)) process.exitCode = EXIT_UNEXPECTED_FAILURE;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = EXIT_SETUP_ERROR;
});
