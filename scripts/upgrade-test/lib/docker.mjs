// Thin wrappers around the docker CLI. Arguments are passed as arrays: no shell, no quoting issues.
import { spawnSync } from 'node:child_process';

// Every container, volume and network created by the bench starts with this prefix.
export const RESOURCE_PREFIX = 'carta-ut-';
const HELPER_IMAGE = 'carta-upgrade-test-sqlite:1';
const HELPER_DOCKERFILE = 'FROM alpine:3.20\nRUN apk add --no-cache sqlite\n';
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export function docker(args, { input, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: MAX_OUTPUT_BYTES });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const lastLines = result.stderr.trim().split('\n').slice(-3).join(' | ');
    throw new Error(`docker ${args.slice(0, 2).join(' ')} failed (exit ${result.status}): ${lastLines}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function serverPlatform() {
  return docker(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']).stdout.trim();
}

/** Digest of the manifest list behind a tag, or null when the tag does not exist. */
export function remoteDigest(ref) {
  const result = docker(['buildx', 'imagetools', 'inspect', ref], { allowFailure: true });
  if (result.status !== 0) return null;
  const match = /^Digest:\s+(sha256:[0-9a-f]{64})/m.exec(result.stdout);
  return match ? match[1] : null;
}

export function pullImage(ref, platform) {
  docker(['pull', '--quiet', '--platform', platform, ref]);
}

export function buildImage(tag, contextDir) {
  docker(['build', '--quiet', '--tag', tag, contextDir]);
}

/** Small Alpine image with the sqlite3 CLI, used to read the databases inside volumes. */
export function ensureHelperImage() {
  const exists = docker(['image', 'inspect', HELPER_IMAGE], { allowFailure: true }).status === 0;
  if (!exists) docker(['build', '--quiet', '--tag', HELPER_IMAGE, '-'], { input: HELPER_DOCKERFILE });
}

/** Runs a shell script in the helper image. `mounts` are `-v` values. */
export function runHelper(mounts, script) {
  const volumeArgs = mounts.flatMap((mount) => ['-v', mount]);
  return docker(['run', '--rm', ...volumeArgs, HELPER_IMAGE, 'sh', '-c', script]).stdout;
}

export function containerState(container) {
  const result = docker(['inspect', '--format', '{{json .State}} {{.RestartCount}}', container], { allowFailure: true });
  if (result.status !== 0) return null;
  const [stateJson, restartCount] = result.stdout.trim().split(/ (?=\d+$)/);
  return { ...JSON.parse(stateJson), RestartCount: Number(restartCount) };
}

export function containerMounts(container) {
  return JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', container]).stdout);
}

export function containerLogs(container) {
  const result = docker(['logs', container], { allowFailure: true });
  return `${result.stdout}\n${result.stderr}`;
}

function listByName(kind, prefix) {
  const listArgs = {
    container: ['ps', '-a', '--format', '{{.Names}}'],
    volume: ['volume', 'ls', '--format', '{{.Name}}'],
    network: ['network', 'ls', '--format', '{{.Name}}'],
  }[kind];
  return docker(listArgs).stdout.split('\n').filter((name) => name.startsWith(prefix));
}

/** Removes the containers, then the volumes and networks whose name starts with `prefix`. */
export function removeResources(prefix) {
  const containers = listByName('container', prefix);
  if (containers.length) docker(['rm', '-f', '-v', ...containers], { allowFailure: true });
  const volumes = listByName('volume', prefix);
  if (volumes.length) docker(['volume', 'rm', '-f', ...volumes], { allowFailure: true });
  const networks = listByName('network', prefix);
  if (networks.length) docker(['network', 'rm', ...networks], { allowFailure: true });
  return { containers: containers.length, volumes: volumes.length, networks: networks.length };
}
