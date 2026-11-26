/**
 * Some actions sign the admin out and send them to the sign-in page, which says why through
 * the `reason` query parameter:
 * - a backup restore revokes every session, the one that started it included, and the admin
 *   account becomes the one of the backup, so the page also says which email and password to use;
 * - "Sign out everywhere" revokes every session, this one included.
 */
const REASON_PARAM = 'reason';
const BACKUP_RESTORED = 'backup-restored';
const LOGGED_OUT_EVERYWHERE = 'logged-out-everywhere';

function hasReason(search: string, reason: string): boolean {
  return new URLSearchParams(search).get(REASON_PARAM) === reason;
}

/**
 * Opens the sign-in page with a full page load rather than a router navigation: the data
 * cached in memory (queries, site settings) belongs to the session that just ended, and to the
 * database a restore replaced.
 */
function openSignInPage(reason: string): void {
  window.location.assign(`/login?${REASON_PARAM}=${reason}`);
}

/** Whether the sign-in page was opened after a restore, from its query string. */
export function isSignInAfterRestore(search: string): boolean {
  return hasReason(search, BACKUP_RESTORED);
}

export function openSignInAfterRestore(): void {
  openSignInPage(BACKUP_RESTORED);
}

/** Whether the sign-in page was opened after "Sign out everywhere", from its query string. */
export function isSignInAfterLogoutEverywhere(search: string): boolean {
  return hasReason(search, LOGGED_OUT_EVERYWHERE);
}

export function openSignInAfterLogoutEverywhere(): void {
  openSignInPage(LOGGED_OUT_EVERYWHERE);
}
