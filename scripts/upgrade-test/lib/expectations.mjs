// Decides which failures a step may have without failing the bench.
import { FAILED_MIGRATION_REFUSAL, row } from './checks.mjs';
import { releaseOf } from './versions.mjs';

export const INJECTED_DUPLICATE_REASON = 'duplicate injected by --inject-duplicate: '
  + 'the schema_integrity migration refuses duplicate category names';

const DUPLICATE_REFUSAL_LABEL = 'injected duplicate refused';

function refusesInjectedDuplicate(profile, injectedDuplicate) {
  return injectedDuplicate && Boolean(profile.uniqueCategoryNames);
}

/** A start refused before any migration ran (`cannot write`, for example): the duplicate was not tested. */
function refusedBeforeMigrations(refusal) {
  return Boolean(refusal?.beforeMigrations);
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
 *   duplicate category names: this reason replaces the one of the notes, unless the start was
 *   refused before the migrations (`refusal`), which the duplicate cannot explain.
 * Photos that the backend does not serve cannot reach the frontend nginx either: whenever
 * `images` may fail, `frontendImages` may fail for the same reason, unless the notes give it
 * a reason of their own.
 */
export function allowedFailures({
  mode, profile, crossedHooks, unmetRequirements, layoutReasons = {}, injectedDuplicate = false, refusal = null,
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
  if (refusesInjectedDuplicate(profile, injectedDuplicate) && !refusedBeforeMigrations(refusal)) {
    allowed.startup = INJECTED_DUPLICATE_REASON;
  }
  return allowed;
}

function injectedDuplicateDetail(started, refusal) {
  if (started) return 'expected refusal missing: the injected duplicate was not refused';
  const found = refusal ? `"${refusal.log}"` : 'no known refusal message';
  return refusal?.log === FAILED_MIGRATION_REFUSAL.log ? `refused: ${found}` : `refused, but not by the failed migration: ${found}`;
}

/**
 * --inject-duplicate: a version that refuses duplicate category names must refuse the working copy,
 * and through the failed migration (`refusal`, found in the logs of a refused start, or null).
 * `allowedFailures` only allows the refused start: without this row, a start, or a refusal for
 * another reason, would go unnoticed. Returns no row when the step does not have to refuse, and a
 * skipped row when the start was refused before the migrations: the duplicate was not tested, and
 * the refusal is judged by its own rows (startup, refusal message, database).
 */
export function checkInjectedDuplicateRefused({ profile, injectedDuplicate = false, started, refusal = null }) {
  if (!refusesInjectedDuplicate(profile, injectedDuplicate)) return [];
  if (!started && refusedBeforeMigrations(refusal)) {
    return [{
      group: 'duplicateRefusal',
      label: DUPLICATE_REFUSAL_LABEL,
      status: 'skip',
      detail: `not applicable: refused before the migrations ("${refusal.log}"), the duplicate was not tested`,
    }];
  }
  const refusedByMigration = !started && refusal?.log === FAILED_MIGRATION_REFUSAL.log;
  return [row('duplicateRefusal', DUPLICATE_REFUSAL_LABEL, refusedByMigration, injectedDuplicateDetail(started, refusal))];
}

/**
 * Required actions whose refusal is expected, by action name (`action` of the hook), with the
 * reason shown in the report. With --inject-duplicate, the new image refuses the copy of the
 * database (`checkDatabaseCopy`) as it refuses the database itself.
 */
export function allowedActionFailures({ profile, injectedDuplicate = false }) {
  return refusesInjectedDuplicate(profile, injectedDuplicate) ? { checkDatabaseCopy: INJECTED_DUPLICATE_REASON } : {};
}

/**
 * Marks the refused actions (`refused: true`) that `allowed` (from allowedActionFailures) expects.
 * Any other failure stays unexpected: a database copy that started, but without the expected log
 * lines or migration status, means that the copy was not refused.
 */
export function markExpectedActions(actions, allowed) {
  for (const result of actions) {
    if (result.status === 'failed' && result.refused && allowed[result.action]) result.expected = allowed[result.action];
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

/**
 * Judges a step once its actions and checks are in (BenchRun.runStep): adds the row of the injected
 * duplicate next to the startup row it explains, then marks the expected failures of the checks and
 * of the actions. `refusal` is the refusal found in the logs of a refused start, or null.
 */
export function judgeStep(step, {
  mode, profile, crossedHooks, unmetRequirements, layoutReasons = {}, injectedDuplicate = false, started, refusal = null,
  previousFailedGroups,
}) {
  const startupIndex = step.checks.findIndex((result) => result.group === 'startup');
  step.checks.splice(startupIndex + 1, 0, ...checkInjectedDuplicateRefused({ profile, injectedDuplicate, started, refusal }));
  const allowed = allowedFailures({ mode, profile, crossedHooks, unmetRequirements, layoutReasons, injectedDuplicate, refusal });
  markExpected(step.checks, { mode, allowed, previousFailedGroups });
  markExpectedActions(step.actions, allowedActionFailures({ profile, injectedDuplicate }));
  return step;
}

export function failedGroups(rows) {
  return new Set(rows.filter((result) => result.status === 'ko').map((result) => result.group));
}

export function unexpectedFailures(rows) {
  return rows.filter((result) => (result.status === 'ko' || result.status === 'failed') && !result.expected);
}
