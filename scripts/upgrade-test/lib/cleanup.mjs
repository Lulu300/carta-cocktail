// Removes what a run leaves on the host: work folders (database copies, photos) and the Docker
// resources prefixed with the run id. Cleanup never throws: it returns warnings instead, so
// that a cleanup error never replaces the result of a run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { helperImageExists, removeResources, RESOURCE_PREFIX, runHelper } from './docker.mjs';

export function workRoot() {
  return path.join(os.tmpdir(), 'carta-upgrade-test');
}

/** Work folder of one run and mode: <root>/<runId>-<layout>-<mode>. */
export function workDirOf(runId, layoutName, mode, root = workRoot()) {
  return path.join(root, `${runId}-${layoutName}-${mode}`);
}

/** Work folders of a run (every layout and mode), or all of them without `runId`. */
export function listWorkDirs(root, runId) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => runId === undefined || name.startsWith(`${runId}-`))
    .map((name) => path.join(root, name));
}

function removeWithHelper(parentDir, name) {
  // Without the helper image (run interrupted before it was built), docker would try to pull it.
  if (helperImageExists()) runHelper([`${parentDir}:/work`], `rm -rf "/work/${name}"`);
}

/**
 * Deletes folders that may hold files written as root by the containers (backups, copies
 * checked by the new image): on Linux the current user cannot delete them, so a helper
 * container does it first. Plain deletion then removes what is left. Only a folder that is
 * still there afterwards gives a warning.
 */
export function removeDirectories(dirs, { removeAsRoot = removeWithHelper } = {}) {
  const warnings = [];
  for (const dir of dirs) {
    const errors = [];
    try {
      removeAsRoot(path.dirname(dir), path.basename(dir));
    } catch (error) {
      errors.push(`helper: ${error.message}`);
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      errors.push(error.message);
    }
    if (fs.existsSync(dir)) warnings.push(`cannot delete ${dir}: ${errors.join('; ') || 'unknown reason'}`);
  }
  return warnings;
}

function removeDockerResources(prefix) {
  try {
    removeResources(prefix);
    return [];
  } catch (error) {
    return [`Docker cleanup of ${prefix}* failed: ${error.message}`];
  }
}

/** Everything a run created, for both modes: used on SIGINT/SIGTERM. */
export function cleanupRun(runId) {
  return [
    ...removeDockerResources(`${RESOURCE_PREFIX}${runId}`),
    ...removeDirectories(listWorkDirs(workRoot(), runId)),
  ];
}

/** Everything left by earlier runs, --keep ones included (--clean-all). */
export function cleanupAll() {
  const warnings = [
    ...removeDockerResources(RESOURCE_PREFIX),
    ...removeDirectories(listWorkDirs(workRoot())),
  ];
  try {
    fs.rmSync(workRoot(), { recursive: true, force: true });
  } catch (error) {
    warnings.push(`cannot delete ${workRoot()}: ${error.message}`);
  }
  return warnings;
}
