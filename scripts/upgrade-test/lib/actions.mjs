// Required actions of the release notes, as listed in the hook files. Each action returns
// { status, detail }: status is done, skipped, manual, "not met" or failed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { changeAdminPassword, checkLogLines } from './checks.mjs';
import { copyDatabaseFiles, DB_FILE_NAME } from './database.mjs';
import { containerMounts, docker } from './docker.mjs';
import { isRequirementMet } from './expectations.mjs';
import { BACKEND_SERVICE, waitForStart } from './instance.mjs';

// Values the v1.5.0 backend refuses (docs/releases/v1.5.0.md, "Security").
const PUBLISHED_JWT_SECRETS = ['default-secret', 'change-me-to-a-random-secret', 'your-random-secret', 'test-secret'];
const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_ADMIN_PASSWORD = 'admin123';
// v1.5.0 refuses a shorter ADMIN_PASSWORD to create or reset the admin.
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const NEW_ADMIN_PASSWORD_LENGTH = 16;
export const MIGRATE_STATUS_OK = 'Database schema is up to date!';

export function randomSecret(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function countFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}

// One folder per release notes, so that a direct jump does not restore the same photos twice.
function rescueDir(ctx) {
  return path.join(ctx.workDir, `uploads-rescue-${ctx.hooksVersion}`);
}

function mountOn(container, destination) {
  return containerMounts(container).find((mount) => mount.Destination === destination);
}

function copyOut(ctx, container, from) {
  const target = rescueDir(ctx);
  fs.mkdirSync(target, { recursive: true });
  const copy = docker(['cp', `${container}:${from}/.`, target], { allowFailure: true });
  return copy.status === 0 ? countFiles(target) : null;
}

/** v1.5.0 Before 1: photos on a mount stay where they are, photos inside the container are copied out. */
function rescueUploads(ctx, { from }) {
  const container = ctx.instance.containerId(BACKEND_SERVICE);
  const mount = mountOn(container, from);
  if (mount) {
    return { status: 'skipped', detail: `${from} is a ${mount.Type} mount: photos not copied, the mount moves to /app/uploads (Before 3)` };
  }
  const files = copyOut(ctx, container, from);
  if (files === null) return { status: 'skipped', detail: `${from} does not exist in the old container: nothing to rescue` };
  return { status: 'done', detail: `no mount on ${from}: ${files} files copied out of the container` };
}

/** v1.6.0 Before 2: on v1.5.0, the upload folder must be a mount; otherwise copy the photos out. */
function checkPhotoMount(ctx) {
  const uploadDir = ctx.previousProfile.uploadDir;
  if (uploadDir !== ctx.profile.uploadDir) {
    return { status: 'skipped', detail: `upgrade from ${ctx.previous.label}: the v1.5.0 actions handle the photos` };
  }
  const container = ctx.instance.containerId(BACKEND_SERVICE);
  const mount = mountOn(container, uploadDir);
  if (mount) return { status: 'done', detail: `${uploadDir} is a ${mount.Type} mount` };
  const files = copyOut(ctx, container, uploadDir) ?? 0;
  return { status: 'done', detail: `${uploadDir} is not a mount: ${files} files copied out of the container` };
}

async function isPhotoServed(container, uploadDir) {
  const photo = docker(['exec', container, 'ls', uploadDir], { allowFailure: true }).stdout.split('\n')[0];
  if (!photo) return null;
  const url = `http://localhost:3001/uploads/${encodeURIComponent(photo)}`;
  return docker(['exec', container, 'wget', '-q', '--spider', url], { allowFailure: true }).status === 0;
}

/**
 * v1.5.0 After 1 and v1.6.0 After 2: copy the rescued photos only into a mounted /app/uploads,
 * then check that a photo is served. `onlyIfRescued` skips everything when nothing was rescued.
 */
async function restoreUploads(ctx, { to, onlyIfRescued = false }) {
  const source = rescueDir(ctx);
  const files = countFiles(source);
  if (onlyIfRescued && files === 0) return { status: 'skipped', detail: 'no photo was rescued before the upgrade' };
  const container = ctx.instance.containerId(BACKEND_SERVICE);
  if (!mountOn(container, to)) return { status: 'failed', detail: `${to} is not a mount: nothing copied` };
  if (files > 0) docker(['cp', `${source}/.`, `${container}:${to}/`]);
  const served = await isPhotoServed(container, to);
  const copied = files > 0 ? `${files} rescued files copied into ${to}` : `${to} is a mount, nothing to copy`;
  if (served === null) return { status: 'done', detail: `${copied}; no photo to check` };
  return { status: served ? 'done' : 'failed', detail: `${copied}; photo ${served ? 'served' : 'NOT served'}` };
}

export function isStrongJwtSecret(secret) {
  return typeof secret === 'string' && secret.length >= MIN_JWT_SECRET_LENGTH && !PUBLISHED_JWT_SECRETS.includes(secret);
}

function ensureJwtSecret(ctx) {
  // The layout's env file: .env next to the compose file, or the env_file that holds the secrets.
  const file = ctx.instance.layout.envFile;
  const current = ctx.instance.readEnv('JWT_SECRET');
  if (isStrongJwtSecret(current)) {
    return { status: 'done', detail: `kept the JWT_SECRET of ${file} (${current.length} characters)` };
  }
  ctx.instance.writeEnv('JWT_SECRET', randomSecret(64));
  return { status: 'done', detail: `JWT_SECRET ${current === undefined ? 'added to' : 'replaced in'} ${file} (64 characters)` };
}

function updateCompose(ctx, { generation }) {
  const previous = ctx.instance.generation;
  ctx.instance.generation = generation;
  const change = previous === generation ? 'already the' : `${previous} file replaced by the`;
  return { status: 'done', detail: `${change} v${generation} compose file of the layout, images pinned to ${ctx.target.label}` };
}

function requireStarted(ctx, hook) {
  if (ctx.startedReleases.has(hook.version)) return { status: 'done', detail: `v${hook.version} started earlier on this path` };
  if (isRequirementMet(hook, ctx.startedReleases, ctx.previous.version)) {
    return { status: 'done', detail: `direct upgrade from ${ctx.previous.label}, allowed by the notes with the v${hook.version} actions` };
  }
  return { status: 'not met', detail: `the path does not start v${hook.version} first` };
}

function databaseCopyDir(ctx) {
  return path.join(ctx.workDir, `db-copy-${ctx.target.label}`);
}

function copyDatabase(ctx) {
  // The backend was stopped after the previous step's checks, as the notes ask.
  const files = copyDatabaseFiles(ctx.instance.dataMount(), databaseCopyDir(ctx));
  const source = ctx.instance.layout.database.kind === 'bind' ? 'the data folder (bind mount)' : 'the db-data volume';
  return { status: 'done', detail: `${files} database files (${DB_FILE_NAME}*) copied out of ${source}` };
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

/**
 * v1.5.0 After 2: an admin password that is admin123 or shorter than 12 characters is changed in
 * Settings > Admin Profile, then ADMIN_PASSWORD is removed from the env file.
 */
async function changeWeakAdminPassword(ctx, hook) {
  const current = ctx.currentAdminPassword();
  if (current !== DEFAULT_ADMIN_PASSWORD && current.length >= MIN_ADMIN_PASSWORD_LENGTH) {
    return { status: 'done', detail: `admin password of ${current.length} characters: nothing to change` };
  }
  const newPassword = randomSecret(NEW_ADMIN_PASSWORD_LENGTH);
  const status = await changeAdminPassword(ctx.backendUrl, ctx.adminEmail, current, newPassword);
  if (status !== 200) return { status: 'failed', detail: `PUT /api/settings/profile: ${status}` };
  ctx.setAdminPassword(newPassword, `password changed in Settings > Admin Profile (v${ctx.hooksVersion} ${hook.step})`);
  const envPassword = ctx.instance.readEnv('ADMIN_PASSWORD');
  const envNote = envPassword !== undefined && envPassword.length < MIN_ADMIN_PASSWORD_LENGTH
    ? `, ADMIN_PASSWORD (${envPassword.length} characters) removed from ${ctx.instance.layout.envFile}`
    : '';
  if (envNote) ctx.instance.removeEnv('ADMIN_PASSWORD');
  return { status: 'done', detail: `password of ${current.length} characters changed to ${newPassword.length} characters${envNote}` };
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
  checkPhotoMount,
  changeWeakAdminPassword,
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

