/**
 * A backup restore signs the admin out: it revokes every session, the one that started it
 * included, and the admin account becomes the one of the backup. Opened through this URL,
 * the sign-in page says so, and which email and password to use.
 */
const REASON_PARAM = 'reason';
const BACKUP_RESTORED = 'backup-restored';

/** Whether the sign-in page was opened after a restore, from its query string. */
export function isSignInAfterRestore(search: string): boolean {
  return new URLSearchParams(search).get(REASON_PARAM) === BACKUP_RESTORED;
}

/**
 * Opens the sign-in page with a full page load rather than a router navigation: the data
 * cached in memory (queries, site settings) comes from the database the restore replaced.
 */
export function openSignInAfterRestore(): void {
  window.location.assign(`/login?${REASON_PARAM}=${BACKUP_RESTORED}`);
}
