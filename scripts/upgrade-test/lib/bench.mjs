// Runs one upgrade path, in one mode (naive or conformant), on a fresh copy of the fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MIGRATE_STATUS_OK, randomSecret, runAction } from './actions.mjs';
import {
  checkAdminLogin, checkFrontendShell, checkImages, checkIntegrity, checkJournalMode, checkLogLines,
  checkPublicApi, checkRowCounts, checkUploadsPersistent, infoRow, row, tryLogin,
} from './checks.mjs';
import { DB_FILE_NAME, fillVolume, replaceAdminCredentials, takeSnapshot } from './database.mjs';
import {
  containerLogs, containerMounts, containerState, docker, removeResources, RESOURCE_PREFIX,
} from './docker.mjs';
import { allowedFailures, failedGroups, markExpected, unexpectedFailures } from './expectations.mjs';
import { BACKEND_SERVICE, FRONTEND_SERVICE, Instance, waitForHttp, waitForStart } from './instance.mjs';
import { hooksForJump, profileOf, releaseOf } from './versions.mjs';

export const ADMIN_EMAIL = 'admin@example.test';
const TEST_PASSWORD_LENGTH = 20;
const FRONTEND_TIMEOUT_MS = 60_000;
const SHUTDOWN_LINE = 'SIGTERM received, shutting down';

function extractPhotos(archive, workDir) {
  const extractDir = path.join(workDir, 'photos');
  fs.mkdirSync(extractDir, { recursive: true });
  const tar = spawnSync('tar', ['-xzf', archive, '-C', extractDir], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`Cannot extract ${path.basename(archive)}: ${tar.stderr.trim()}`);
  // The archive holds a flat uploads/ folder; accept a flat archive too.
  const nested = path.join(extractDir, 'uploads');
  return fs.existsSync(nested) ? nested : extractDir;
}

function bcryptHash(image, platform, password) {
  const script = "process.stdout.write(require('bcryptjs').hashSync(process.env.TEST_PASSWORD, 10))";
  return docker(['run', '--rm', '--platform', platform, '--entrypoint', 'node', '-e', `TEST_PASSWORD=${password}`,
    image, '-e', script]).stdout.trim();
}

function envSecretValues(layout) {
  const values = { ADMIN_EMAIL };
  for (const [name, length] of Object.entries(layout.envSecrets)) values[name] = randomSecret(length);
  return values;
}

export class BenchRun {
  constructor({ fixtureDir, layout, layoutDir, mode, steps, images, hookFiles, runId, timeoutMs }) {
    Object.assign(this, { fixtureDir, layout, mode, steps, images, hookFiles, timeoutMs });
    this.project = `${RESOURCE_PREFIX}${runId}-${layout.name}-${mode}`;
    this.workDir = path.join(os.tmpdir(), 'carta-upgrade-test', `${runId}-${layout.name}-${mode}`);
    this.instance = new Instance({ project: this.project, layout, layoutDir, workDir: this.workDir });
    this.logsDir = path.join(this.workDir, 'logs');
    this.startedReleases = new Set();
    this.previousFailedGroups = new Set();
    this.result = { mode, steps: [], setup: {} };
  }

  log(message) {
    console.log(`[${this.layout.name}/${this.mode}] ${message}`);
  }

  async execute({ keep }) {
    try {
      await this.prepare();
      for (let index = 0; index < this.steps.length; index++) {
        this.result.steps.push(await this.runStep(index));
      }
    } catch (error) {
      this.result.error = error.message;
    } finally {
      this.finish(keep);
    }
    return this.result;
  }

  hasFailed() {
    return Boolean(this.result.error)
      || this.result.steps.some((step) => unexpectedFailures([...step.actions, ...step.checks]).length > 0);
  }

  finish(keep) {
    if (keep && this.hasFailed()) {
      this.result.kept = { project: this.project, workDir: this.workDir };
      return;
    }
    if (fs.existsSync(this.instance.composePath)) this.instance.down();
    removeResources(this.project);
    fs.rmSync(this.workDir, { recursive: true, force: true });
  }

  // ───────────── Preparation: working copy, credentials, first containers ─────────────

  async prepare() {
    fs.mkdirSync(this.logsDir, { recursive: true });
    const first = this.steps[0];
    const photosDir = extractPhotos(path.join(this.fixtureDir, 'uploads.tgz'), this.workDir);
    const dataDir = this.layout.database.kind === 'bind'
      ? path.join(this.instance.dir, this.layout.database.hostDir)
      : path.join(this.workDir, 'seed-data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(path.join(this.fixtureDir, DB_FILE_NAME), path.join(dataDir, DB_FILE_NAME));

    this.testPassword = randomSecret(TEST_PASSWORD_LENGTH);
    const passwordHash = bcryptHash(this.images[first.label].backend, this.images[first.label].platform, this.testPassword);
    const users = replaceAdminCredentials(dataDir, { email: ADMIN_EMAIL, passwordHash });
    this.baseline = takeSnapshot(dataDir);
    this.lastSnapshot = this.baseline;
    this.admin = { password: this.testPassword, label: 'test password (hash replaced in the copy)' };
    this.result.setup = {
      users,
      tables: Object.keys(this.baseline.counts).length,
      rows: Object.values(this.baseline.counts).reduce((sum, count) => sum + count, 0),
      photosInArchive: fs.readdirSync(photosDir).length,
      photosReferenced: this.baseline.imagePaths.length,
      journalMode: this.baseline.journalMode,
    };

    this.instance.writeEnvFile(envSecretValues(this.layout));
    this.instance.images = this.images[first.label];
    this.instance.writeComposeFile(ADMIN_EMAIL);
    this.instance.createExternalNetwork();
    this.instance.create();
    if (this.layout.database.kind === 'volume') fillVolume(this.instance.dataMount(), dataDir);
    this.placePhotos(photosDir);
  }

  placePhotos(photosDir) {
    const { photos } = this.layout;
    if (photos.kind === 'bind') {
      fs.cpSync(photosDir, path.join(this.instance.dir, photos.hostDir), { recursive: true });
      return;
    }
    docker(['cp', `${photosDir}/.`, `${this.instance.containerId(BACKEND_SERVICE)}:${photos.containerPath}`]);
  }

  // ───────────── One step: start a version, or jump to it ─────────────

  stepContext(index) {
    const target = { ...this.steps[index], images: this.images[this.steps[index].label] };
    const previous = this.steps[index - 1];
    const profile = profileOf(this.hookFiles, target.version);
    const fromDbPush = !previous || !profileOf(this.hookFiles, previous.version).migrations;
    const expectedStartLogs = [...(fromDbPush && profile.migrations ? profile.baselineLogs : []), ...profile.startupLogs];
    return {
      target,
      previous,
      profile,
      fromDbPush,
      expectedStartLogs,
      crossedHooks: previous ? hooksForJump(this.hookFiles, previous.version, target.version) : [],
      instance: this.instance,
      workDir: this.workDir,
      startedReleases: this.startedReleases,
      timeoutMs: this.timeoutMs,
      adminEmail: ADMIN_EMAIL,
    };
  }

  async runHooks(ctx, phase) {
    const results = [];
    for (const hooks of ctx.crossedHooks) {
      for (const hook of hooks[phase]) {
        results.push(await runAction({ ...ctx, hooksVersion: hooks.version }, hook));
      }
    }
    return results;
  }

  unmetRequirements(ctx) {
    return ctx.crossedHooks
      .flatMap((hooks) => hooks.before.filter((hook) => hook.action === 'requireStarted'))
      .filter((hook) => !this.startedReleases.has(hook.version))
      .map((hook) => `v${hook.version}`);
  }

  async runStep(index) {
    const ctx = this.stepContext(index);
    const title = ctx.previous ? `${ctx.previous.label} -> ${ctx.target.label}` : `start ${ctx.target.label}`;
    this.log(`${title}: running`);
    const step = { from: ctx.previous?.label ?? null, to: ctx.target.label, actions: [], checks: [] };
    const conformant = this.mode === 'conformant' && ctx.previous;
    const unmet = this.unmetRequirements(ctx);

    if (conformant) step.actions.push(...await this.runHooks(ctx, 'before'));
    this.instance.images = ctx.target.images;
    this.instance.writeComposeFile(ADMIN_EMAIL);
    this.instance.up();

    const backend = this.instance.containerId(BACKEND_SERVICE);
    const outcome = await waitForStart(backend, this.timeoutMs);
    fs.writeFileSync(path.join(this.logsDir, `${index}-${ctx.target.label}.log`), outcome.logs);
    step.checks.push(this.startupRow(outcome));
    if (outcome.started) {
      this.startedReleases.add(releaseOf(ctx.target.version));
      if (ctx.profile.seedResetsAdmin) this.trackAdminPasswordReset(ctx);
      ctx.backendUrl = this.instance.serviceUrl(BACKEND_SERVICE, 3001);
      if (conformant) step.actions.push(...await this.runHooks(ctx, 'after'));
      step.checks.push(...await this.runningChecks(ctx, outcome));
    } else {
      step.checks.push(this.refusalMessageRow(ctx, outcome));
      step.checks.push({ group: 'http', label: 'HTTP checks', status: 'skip', detail: 'backend not running' });
    }
    step.checks.push(checkUploadsPersistent(containerMounts(backend), ctx.profile.uploadDir));

    const stopStartedAt = Date.now();
    this.instance.stopBackend();
    if (outcome.started) step.checks.push(this.shutdownRow(ctx, backend, Date.now() - stopStartedAt));
    step.checks.push(...this.databaseChecks(ctx, outcome));

    const allowed = allowedFailures({ mode: this.mode, profile: ctx.profile, crossedHooks: ctx.crossedHooks, unmetRequirements: unmet });
    markExpected(step.checks, { mode: this.mode, allowed, previousFailedGroups: this.previousFailedGroups });
    this.previousFailedGroups = failedGroups(step.checks);
    const unexpected = unexpectedFailures([...step.actions, ...step.checks]).length;
    this.log(`${title}: ${outcome.started ? 'started' : 'refused'}, ${unexpected} unexpected failure(s)`);
    return step;
  }

  trackAdminPasswordReset(ctx) {
    const envPassword = this.instance.readEnv('ADMIN_PASSWORD') || 'admin123';
    this.admin = {
      password: envPassword,
      label: `ADMIN_PASSWORD of ${this.layout.envFile} (${envPassword.length} characters), written by the v${releaseOf(ctx.target.version)} seed`,
    };
  }

  refusalMessageRow(ctx, outcome) {
    const expected = ctx.profile.refusalLog;
    if (!expected) return infoRow('refusal', 'refusal message', 'no refusal message defined for this version');
    const found = outcome.logs.includes(expected);
    return row('refusal', 'refusal message', found, `"${expected}" ${found ? 'found' : 'missing'}`);
  }

  shutdownRow(ctx, backend, durationMs) {
    const { ExitCode: exitCode } = containerState(backend);
    const signalLogged = containerLogs(backend).includes(SHUTDOWN_LINE);
    const detail = `exit code ${exitCode} after ${(durationMs / 1000).toFixed(1)} s, "${SHUTDOWN_LINE}" ${signalLogged ? 'logged' : 'not logged'}`;
    if (!ctx.profile.cleanShutdown) return infoRow('shutdown', 'docker compose stop', detail);
    return row('shutdown', 'clean shutdown on docker compose stop', exitCode === 0 && signalLogged, detail);
  }

  startupRow(outcome) {
    if (outcome.started) return row('startup', 'backend starts', true, 'API running');
    const detail = outcome.timedOut
      ? `no "API running" line after ${this.timeoutMs / 1000} s`
      : `refused: exit code ${outcome.exitCode}, ${outcome.restarts} restart(s)`;
    return row('startup', 'backend starts', false, detail);
  }

  async runningChecks(ctx, outcome) {
    const rows = [...checkLogLines(outcome.logs, ctx.expectedStartLogs)];
    if (ctx.profile.migrations) {
      const status = this.instance.compose(['exec', '-T', BACKEND_SERVICE, 'npx', 'prisma', 'migrate', 'status'], { allowFailure: true });
      const upToDate = status.stdout.includes(MIGRATE_STATUS_OK);
      rows.push(row('migrateStatus', 'prisma migrate status', upToDate, upToDate ? MIGRATE_STATUS_OK : 'not up to date'));
    }
    rows.push(await checkAdminLogin(ctx.backendUrl, { email: ADMIN_EMAIL, password: this.admin.password, label: this.admin.label }));
    if (this.admin.password !== this.testPassword) {
      const { meStatus } = await tryLogin(ctx.backendUrl, ADMIN_EMAIL, this.testPassword);
      rows.push(infoRow('login', 'admin login: test password (hash replaced in the copy)',
        meStatus === 200 ? 'accepted' : 'rejected: the v1.4.0 seed rewrote the hash from ADMIN_PASSWORD at start'));
    }
    rows.push(...await checkPublicApi(ctx.backendUrl));

    const frontendUrl = this.instance.serviceUrl(FRONTEND_SERVICE, 80);
    await waitForHttp(`${frontendUrl}/`, FRONTEND_TIMEOUT_MS);
    rows.push(await checkFrontendShell(frontendUrl));
    rows.push(await checkImages(ctx.backendUrl, this.baseline.imagePaths, 'backend'));
    rows.push(await checkImages(frontendUrl, this.baseline.imagePaths, `frontend nginx ${ctx.target.label}`));
    return rows;
  }

  databaseChecks(ctx, outcome) {
    const snapshot = takeSnapshot(this.instance.dataMount());
    const rows = [checkRowCounts(this.baseline, snapshot), checkIntegrity(snapshot)];
    if (outcome.started) {
      rows.push(checkJournalMode(snapshot, ctx.profile.journalMode));
    } else {
      const untouched = snapshot.fingerprint === this.lastSnapshot.fingerprint;
      rows.push(row('refusal', 'database left untouched by the refused start', untouched,
        untouched ? 'same SHA-256 as before the jump' : 'database file changed'));
    }
    if (ctx.fromDbPush && ctx.profile.migrations) {
      const created = snapshot.backups > this.lastSnapshot.backups;
      rows.push(row('backup', 'pre-migrate-*.db backup in the data folder', created, `${snapshot.backups} backup(s)`));
    }
    this.lastSnapshot = snapshot;
    return rows;
  }
}
