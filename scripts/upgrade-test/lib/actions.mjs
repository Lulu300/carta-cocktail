// Required actions of the release notes, as listed in the hook files. Each action returns
// { status, detail }: status is done, skipped, manual, "not met" or failed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkLogLines, tryLogin } from './checks.mjs';
import { copyDatabaseFiles, DB_FILE_NAME } from './database.mjs';
import { docker } from './docker.mjs';
import { BACKEND_SERVICE, waitForStart } from './instance.mjs';

// Values the v1.5.0 backend refuses (docs/releases/v1.5.0.md, "Security").
const PUBLISHED_JWT_SECRETS = ['default-secret', 'change-me-to-a-random-secret', 'your-random-secret', 'test-secret'];
const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_ADMIN_PASSWORD = 'admin123';
export const MIGRATE_STATUS_OK = 'Database schema is up to date!';

export function randomSecret(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function countFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}

function rescueDir(ctx) {
  return path.join(ctx.workDir, 'uploads-rescue');
}

function rescueUploads(ctx, { from }) {
  const target = rescueDir(ctx);
  fs.mkdirSync(target, { recursive: true });
  const container = ctx.instance.containerId(BACKEND_SERVICE);
  const copy = docker(['cp', `${container}:${from}/.`, target], { allowFailure: true });
  if (copy.status !== 0) return { status: 'skipped', detail: `${from} does not exist in the old container: nothing to rescue` };
  return { status: 'done', detail: `${countFiles(target)} files copied out of ${from}` };
}

function restoreUploads(ctx, { to }) {
  const source = rescueDir(ctx);
  const files = countFiles(source);
  if (files === 0) return { status: 'skipped', detail: 'nothing was rescued' };
  const container = ctx.instance.containerId(BACKEND_SERVICE);
  docker(['exec', container, 'mkdir', '-p', to]);
  docker(['cp', `${source}/.`, `${container}:${to}/`]);
  return { status: 'done', detail: `${files} files copied into ${to} of the new container` };
}

export function isStrongJwtSecret(secret) {
  return typeof secret === 'string' && secret.length >= MIN_JWT_SECRET_LENGTH && !PUBLISHED_JWT_SECRETS.includes(secret);
}

function ensureJwtSecret(ctx) {
  const current = ctx.instance.readEnv('JWT_SECRET');
  if (isStrongJwtSecret(current)) {
    return { status: 'done', detail: `kept the existing JWT_SECRET (${current.length} characters)` };
  }
  ctx.instance.writeEnv('JWT_SECRET', randomSecret(64));
  return { status: 'done', detail: `JWT_SECRET ${current === undefined ? 'added' : 'replaced'} (64 characters)` };
}

function updateCompose(ctx, { generation }) {
  const previous = ctx.instance.generation;
  ctx.instance.generation = generation;
  const change = previous === generation ? 'already the' : `${previous} file replaced by the`;
  return { status: 'done', detail: `${change} v${generation} compose file of the layout, images pinned to ${ctx.target.label}` };
}

function requireStarted(ctx, { version }) {
  if (ctx.startedReleases.has(version)) return { status: 'done', detail: `v${version} started earlier on this path` };
  return { status: 'not met', detail: `the path does not start v${version} first` };
}

function databaseCopyDir(ctx) {
  return path.join(ctx.workDir, `db-copy-${ctx.target.label}`);
}

function copyDatabase(ctx) {
  // The backend was stopped after the previous step's checks, as the notes ask.
  const files = copyDatabaseFiles(ctx.instance.dataMount(), databaseCopyDir(ctx));
  return { status: 'done', detail: `${files} database files copied (${DB_FILE_NAME}*)` };
}

/** Starts the new backend image on a second copy of the database, as the notes describe. */
async function checkDatabaseCopy(ctx) {
  const checkDir = path.join(ctx.workDir, `db-check-${ctx.target.label}`);
  fs.cpSync(databaseCopyDir(ctx), checkDir, { recursive: true });
  const name = `${ctx.instance.project}-check`;
  docker(['run', '--detach', '--name', name, '--platform', ctx.target.images.platform,
    '-v', `${checkDir}:/app/data`,
    '-e', `DATABASE_URL=file:/app/data/${DB_FILE_NAME}`, '-e', `JWT_SECRET=${randomSecret(64)}`,
    ctx.target.images.backend]);
  try {
    const outcome = await waitForStart(name, ctx.timeoutMs);
    if (!outcome.started) {
      return { status: 'failed', detail: `the copy was refused (exit code ${outcome.exitCode ?? 'none'}): the notes say not to upgrade` };
    }
    const lines = checkLogLines(outcome.logs, ctx.expectedStartLogs);
    const found = lines.filter((line) => line.status === 'ok').length;
    const status = docker(['exec', name, 'npx', 'prisma', 'migrate', 'status'], { allowFailure: true }).stdout;
    const upToDate = status.includes(MIGRATE_STATUS_OK);
    const ok = found === lines.length && upToDate;
    return {
      status: ok ? 'done' : 'failed',
      detail: `copy started, ${found}/${lines.length} expected log lines, migrate status ${upToDate ? 'up to date' : 'NOT up to date'}`,
    };
  } finally {
    docker(['rm', '--force', '--volumes', name], { allowFailure: true });
  }
}

async function checkDefaultAdminPassword(ctx) {
  const { meStatus } = await tryLogin(ctx.backendUrl, ctx.adminEmail, DEFAULT_ADMIN_PASSWORD);
  if (meStatus === 200) return { status: 'manual', detail: 'admin123 is accepted: the admin must change it' };
  return { status: 'done', detail: 'admin123 is rejected: nothing to change' };
}

function manual(ctx, { note }) {
  return { status: 'manual', detail: note };
}

const ACTIONS = {
  rescueUploads,
  ensureJwtSecret,
  updateCompose,
  requireStarted,
  copyDatabase,
  checkDatabaseCopy,
  restoreUploads,
  checkDefaultAdminPassword,
  manual,
};

export async function runAction(ctx, hook) {
  const run = ACTIONS[hook.action];
  if (!run) throw new Error(`Unknown action "${hook.action}" in the hooks of v${ctx.hooksVersion}`);
  try {
    const { status, detail } = await run(ctx, hook);
    return { step: `v${ctx.hooksVersion} ${hook.step}`, note: hook.note, status, detail };
  } catch (error) {
    return { step: `v${ctx.hooksVersion} ${hook.step}`, note: hook.note, status: 'failed', detail: error.message };
  }
}

