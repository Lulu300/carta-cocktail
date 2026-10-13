// Decides which failures a step may have without failing the bench.
import { releaseOf } from './versions.mjs';

export const INJECTED_DUPLICATE_REASON = 'duplicate injected by --inject-duplicate: '
  + 'the schema_integrity migration refuses duplicate category names';

function refusesInjectedDuplicate(profile, injectedDuplicate) {
  return injectedDuplicate && Boolean(profile.uniqueCategoryNames);
}

/**
 * `requireStarted` hooks: the version must have started earlier on the path, unless the jump
 * comes from a release line the notes allow to skip it (`directFrom: '1.4'` for v1.6.0).
 */
export function isRequirementMet(hook, startedReleases, previousVersion) {
  if (startedReleases.has(hook.version)) return true;
  return Boolean(hook.directFrom) && releaseOf(previousVersion).startsWith(`${hook.directFrom}.`);
}

/**
 * Failures allowed for a step, by check group, with the reason shown in the report:
 * - known bugs of the target version (any mode);
 * - in naive mode, what the release notes of the crossed versions say breaks without their actions.
 *   The notes describe the default setup: `layoutReasons` replaces their reason when the layout
 *   knows the real cause;
 * - a refused start when the path skips a version that the notes require to start first;
 * - with --inject-duplicate (`injectedDuplicate`), a refused start on a version that refuses
 *   duplicate category names: this reason replaces the one of the notes.
 * Photos that the backend does not serve cannot reach the frontend nginx either: whenever
 * `images` may fail, `frontendImages` may fail for the same reason, unless the notes give it
 * a reason of their own.
 */
export function allowedFailures({
  mode, profile, crossedHooks, unmetRequirements, layoutReasons = {}, injectedDuplicate = false,
}) {
  const allowed = { ...profile.knownIssues };
  if (mode === 'naive') {
    for (const hooks of crossedHooks) Object.assign(allowed, hooks.naiveMayFail);
    for (const [group, reason] of Object.entries(layoutReasons)) {
      if (allowed[group]) allowed[group] = reason;
    }
  }
  if (allowed.images && !allowed.frontendImages) allowed.frontendImages = allowed.images;
  if (unmetRequirements.length) {
    allowed.startup = `the path skips ${unmetRequirements.join(', ')}, which the notes require to start first`;
  }
  if (refusesInjectedDuplicate(profile, injectedDuplicate)) allowed.startup = INJECTED_DUPLICATE_REASON;
  return allowed;
}

/**
 * Required actions that may fail, by action name (`action` of the hook), with the reason shown in
 * the report. With --inject-duplicate, the new image refuses the copy of the database
 * (`checkDatabaseCopy`) as it refuses the database itself.
 */
export function allowedActionFailures({ profile, injectedDuplicate = false }) {
  return refusesInjectedDuplicate(profile, injectedDuplicate) ? { checkDatabaseCopy: INJECTED_DUPLICATE_REASON } : {};
}

/** Marks the failed actions that `allowed` (from allowedActionFailures) expects. */
export function markExpectedActions(actions, allowed) {
  for (const result of actions) {
    if (result.status === 'failed' && allowed[result.action]) result.expected = allowed[result.action];
  }
  return actions;
}

/**
 * Marks the KO rows that are expected. In naive mode, a check that already failed at the
 * previous step is expected to fail again: nothing in a naive upgrade repairs it.
 */
export function markExpected(rows, { mode, allowed, previousFailedGroups }) {
  for (const result of rows) {
    if (result.status !== 'ko') continue;
    if (allowed[result.group]) result.expected = allowed[result.group];
    else if (mode === 'naive' && previousFailedGroups.has(result.group)) result.expected = 'already failing at the previous step';
  }
  return rows;
}

export function failedGroups(rows) {
  return new Set(rows.filter((result) => result.status === 'ko').map((result) => result.group));
}

export function unexpectedFailures(rows) {
  return rows.filter((result) => (result.status === 'ko' || result.status === 'failed') && !result.expected);
}
