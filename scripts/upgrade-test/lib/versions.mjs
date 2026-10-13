// Version strings, upgrade paths and the selection of the hook files that apply to a jump.

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
export const LOCAL_STEP = 'local';

export function parseVersion(text) {
  const match = VERSION_PATTERN.exec(text);
  if (!match) {
    throw new Error(`Invalid version "${text}": expected X.Y.Z, X.Y.Z-rc.N or ${LOCAL_STEP}`);
  }
  return {
    text,
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

// "1.6.0-rc.1" -> "1.6.0": a pre-release follows the release notes of its target version.
export function releaseOf(text) {
  return parseVersion(text).core.join('.');
}

function compareCores(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function comparePrereleases(a, b) {
  // A release is newer than any of its pre-releases.
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    const bothNumeric = /^\d+$/.test(left[i]) && /^\d+$/.test(right[i]);
    const order = bothNumeric ? Number(left[i]) - Number(right[i]) : left[i].localeCompare(right[i]);
    if (order !== 0) return order < 0 ? -1 : 1;
  }
  return 0;
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  return compareCores(left.core, right.core) || comparePrereleases(left.prerelease, right.prerelease);
}

/**
 * "1.4.0,1.5.0,local" -> steps. A `local` step is an image built from the checkout; it follows
 * the hooks of `localVersion`, or of `defaultLocalVersion` when `localVersion` is not given.
 */
export function parseUpgradePath(text, { hookFiles, localVersion }) {
  const labels = text.split(',').map((label) => label.trim()).filter(Boolean);
  if (labels.length < 2) throw new Error('--path needs at least two versions, for example 1.4.0,1.5.0');
  const steps = labels.map((label) => ({
    label,
    version: label === LOCAL_STEP ? null : parseVersion(label).text,
    local: label === LOCAL_STEP,
  }));
  const publishedVersions = steps.filter((step) => !step.local).map((step) => step.version);
  const checkoutVersion = localVersion ?? defaultLocalVersion(hookFiles, publishedVersions);
  for (const step of steps.filter((step) => step.local)) step.version = checkoutVersion;
  for (let i = 1; i < steps.length; i++) {
    if (compareVersions(steps[i - 1].version, steps[i].version) >= 0) {
      throw pathOrderError(steps[i - 1], steps[i]);
    }
  }
  return steps;
}

function pathOrderError(previous, next) {
  const message = `--path must go up: ${previous.label} -> ${next.label}`;
  const localStep = [previous, next].find((step) => step.local);
  if (!localStep) return new Error(message);
  return new Error(
    `${message} ("${LOCAL_STEP}" follows the notes of ${localStep.version}; `
    + 'set --local-version to the version of the checkout)',
  );
}

// "1.11.0" -> "1.12.0", "1.12.0-rc.1" -> "1.13.0".
function nextMinor(version) {
  const [major, minor] = parseVersion(version).core;
  return `${major}.${minor + 1}.0`;
}

/**
 * Version followed by a `local` step without --local-version: the minor release after the newest
 * of the hook files and the published versions of the path. The checkout is newer than anything
 * released, so the jump to it goes up, and it crosses every hook file, including one already added
 * for a release in preparation.
 */
export function defaultLocalVersion(hookFiles, publishedVersions) {
  const newest = [latestHookVersion(hookFiles), ...publishedVersions].sort(compareVersions).at(-1);
  return nextMinor(newest);
}

function sortedByRelease(hookFiles) {
  return [...hookFiles].sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * Hook files of every release crossed by a jump, oldest first: releases newer than the
 * release of `from` and up to the release of `to`. 1.4.0 -> 1.6.0-rc.1 crosses 1.5.0 and 1.6.0;
 * 1.6.0-rc.1 -> 1.6.0 crosses nothing.
 */
export function hooksForJump(hookFiles, from, to) {
  const fromRelease = releaseOf(from);
  const toRelease = releaseOf(to);
  return sortedByRelease(hookFiles).filter(
    (hooks) => compareVersions(hooks.version, fromRelease) > 0 && compareVersions(hooks.version, toRelease) <= 0,
  );
}

/**
 * Behaviour of a version (upload folder, migrations…): merged profiles of all releases up to it.
 * A newer profile replaces a field, except `refusals`, which add up: a release that adds a
 * refusal keeps the ones of the releases before it.
 */
export function profileOf(hookFiles, version) {
  const release = releaseOf(version);
  return sortedByRelease(hookFiles)
    .filter((hooks) => compareVersions(hooks.version, release) <= 0)
    .reduce((profile, hooks) => ({
      ...profile,
      ...hooks.profile,
      refusals: [...profile.refusals, ...(hooks.profile.refusals ?? [])],
    }), { refusals: [] });
}

export function latestHookVersion(hookFiles) {
  return sortedByRelease(hookFiles).at(-1).version;
}
