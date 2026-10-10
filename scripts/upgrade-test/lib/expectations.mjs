// Decides which failures a step may have without failing the bench.

/**
 * Failures allowed for a step, by check group, with the reason shown in the report:
 * - known bugs of the target version (any mode);
 * - in naive mode, what the release notes of the crossed versions say breaks without their actions.
 *   The notes describe the default setup: `layoutReasons` replaces their reason when the layout
 *   knows the real cause;
 * - a refused start when the path skips a version that the notes require to start first.
 */
export function allowedFailures({ mode, profile, crossedHooks, unmetRequirements, layoutReasons = {} }) {
  const allowed = { ...profile.knownIssues };
  if (mode === 'naive') {
    for (const hooks of crossedHooks) Object.assign(allowed, hooks.naiveMayFail);
    for (const [group, reason] of Object.entries(layoutReasons)) {
      if (allowed[group]) allowed[group] = reason;
    }
  }
  if (unmetRequirements.length) {
    allowed.startup = `the path skips ${unmetRequirements.join(', ')}, which the notes require to start first`;
  }
  return allowed;
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
