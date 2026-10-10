// One Carta Cocktail installation under test: a compose project rendered from a layout.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { containerLogs, containerState, docker } from './docker.mjs';

export const BACKEND_SERVICE = 'carta-cocktail-backend';
export const FRONTEND_SERVICE = 'carta-cocktail-frontend';
export const READY_LINE = 'Carta Cocktail API running on port';
const POLL_INTERVAL_MS = 2_000;

export function renderTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => {
    if (!(key in values)) throw new Error(`No value for ${placeholder}`);
    return values[key];
  });
}

/** Reads `KEY=value` lines (the env files of the layouts have no quotes nor comments). */
export function readEnvVariable(text, name) {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`${name}=`));
  return line === undefined ? undefined : line.slice(name.length + 1);
}

export function writeEnvVariable(text, name, value) {
  const lines = text.split('\n').filter((line) => line !== '');
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (index === -1) lines.push(`${name}=${value}`);
  else lines[index] = `${name}=${value}`;
  return `${lines.join('\n')}\n`;
}

export class Instance {
  constructor({ project, layout, layoutDir, workDir }) {
    this.project = project;
    this.layout = layout;
    this.layoutDir = layoutDir;
    this.dir = path.join(workDir, 'instance');
    this.generation = layout.initialGeneration;
    this.images = null;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  get composePath() {
    return path.join(this.dir, this.layout.composeFile);
  }

  get envPath() {
    return path.join(this.dir, this.layout.envFile);
  }

  readEnv(name) {
    return readEnvVariable(fs.readFileSync(this.envPath, 'utf8'), name);
  }

  writeEnv(name, value) {
    fs.writeFileSync(this.envPath, writeEnvVariable(fs.readFileSync(this.envPath, 'utf8'), name, value));
  }

  removeEnv(name) {
    const lines = fs.readFileSync(this.envPath, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith(`${name}=`));
    fs.writeFileSync(this.envPath, `${lines.join('\n')}\n`);
  }

  writeEnvFile(values) {
    const template = fs.readFileSync(path.join(this.layoutDir, `${this.layout.envFile}.template`), 'utf8');
    fs.writeFileSync(this.envPath, renderTemplate(template, values));
  }

  /** Writes the compose file of the current generation with the current images. */
  writeComposeFile(adminEmail) {
    const template = fs.readFileSync(path.join(this.layoutDir, `compose-${this.generation}.yml`), 'utf8');
    fs.writeFileSync(this.composePath, renderTemplate(template, {
      PROJECT: this.project,
      ADMIN_EMAIL: adminEmail,
      BACKEND_IMAGE: this.images.backend,
      FRONTEND_IMAGE: this.images.frontend,
      BACKEND_PLATFORM: this.images.platform,
      FRONTEND_PLATFORM: this.images.platform,
    }));
  }

  compose(args, options) {
    return docker(['compose', '--project-name', this.project, '--file', this.composePath, ...args], options);
  }

  createExternalNetwork() {
    if (this.layout.externalNetwork) docker(['network', 'create', `${this.project}-${this.layout.externalNetwork}`]);
  }

  /** Creates the containers and volumes without starting them, to place the data first. */
  create() {
    this.compose(['up', '--no-start', '--pull', 'never']);
  }

  up() {
    this.compose(['up', '--detach', '--pull', 'never']);
  }

  stopBackend() {
    this.compose(['stop', BACKEND_SERVICE]);
  }

  containerId(service) {
    return this.compose(['ps', '--all', '--quiet', service]).stdout.trim();
  }

  serviceUrl(service, containerPort) {
    const address = this.compose(['port', service, String(containerPort)]).stdout.trim();
    return `http://${address}`;
  }

  /** `-v` source of the database folder: a host folder or a named volume. */
  dataMount() {
    const { database } = this.layout;
    return database.kind === 'bind' ? path.join(this.dir, database.hostDir) : `${this.project}_${database.volume}`;
  }

  down() {
    this.compose(['down', '--volumes', '--remove-orphans'], { allowFailure: true });
  }
}

/** Waits for the API ready line, or for the container to stop or restart (refused start). */
export async function waitForStart(container, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = containerLogs(container);
    if (logs.includes(READY_LINE)) return { started: true, logs };
    const state = containerState(container);
    if (state && (state.RestartCount > 0 || state.Status === 'exited' || state.Status === 'restarting')) {
      return { started: false, exitCode: state.ExitCode, restarts: state.RestartCount, logs };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { started: false, timedOut: true, logs: containerLogs(container) };
}

export async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}
