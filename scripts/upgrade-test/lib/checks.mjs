// Checks run after each step. Each one returns rows { group, label, status, detail }: status is
// ok, ko or info. Details carry counts and statuses only, never data read from the database.

const REQUEST_TIMEOUT_MS = 15_000;

export function row(group, label, ok, detail) {
  return { group, label, status: ok ? 'ok' : 'ko', detail };
}

export function infoRow(group, label, detail) {
  return { group, label, status: 'info', detail };
}

function describeError(error) {
  return [error.message, error.cause?.code ?? error.cause?.message].filter(Boolean).join(': ');
}

async function fetchOnce(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
}

/**
 * The docker commands run with spawnSync and block the event loop: a keep-alive connection that
 * the server closed meanwhile is only seen as closed when the next request uses it
 * (UND_ERR_SOCKET). That request is sent once more, on a new connection.
 */
async function request(url, options = {}) {
  try {
    return await fetchOnce(url, options);
  } catch (error) {
    if (error.cause?.code !== 'UND_ERR_SOCKET') return { status: 0, body: Buffer.alloc(0), error: describeError(error) };
  }
  try {
    return await fetchOnce(url, options);
  } catch (error) {
    return { status: 0, body: Buffer.alloc(0), error: describeError(error) };
  }
}

function parseJson(body) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}

export function checkLogLines(logs, expectedLines) {
  return expectedLines.map((line) => row('logs', `log: "${line}"`, logs.includes(line), logs.includes(line) ? 'found' : 'missing'));
}

/** Logs in and calls /api/auth/me. Returns { loginStatus, meStatus }. */
export async function tryLogin(backendUrl, email, password) {
  const login = await request(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = parseJson(login.body)?.token;
  if (login.status !== 200 || !token) return { loginStatus: login.status, meStatus: null, error: login.error };
  const me = await request(`${backendUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  return { loginStatus: login.status, meStatus: me.status };
}

/** Settings > Admin Profile: returns the HTTP status of the password change. */
export async function changeAdminPassword(backendUrl, email, currentPassword, newPassword) {
  const login = await request(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: currentPassword }),
  });
  const token = parseJson(login.body)?.token;
  if (!token) return login.status;
  const update = await request(`${backendUrl}/api/settings/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return update.status;
}

export async function checkAdminLogin(backendUrl, { email, password, label }) {
  const { loginStatus, meStatus, error } = await tryLogin(backendUrl, email, password);
  const outcome = error ? `request failed (${error})` : String(loginStatus);
  return row('login', `admin login: ${label}`, meStatus === 200,
    `POST /api/auth/login ${outcome}${meStatus === null ? '' : `, GET /api/auth/me ${meStatus}`}`);
}

/** Public menu list, every public menu, and the recipe of every cocktail shown on them. */
export async function checkPublicApi(backendUrl) {
  const list = await request(`${backendUrl}/api/public/menus`);
  const menus = parseJson(list.body);
  if (list.status !== 200 || !Array.isArray(menus)) {
    return [row('publicApi', 'public menu list', false, `GET /api/public/menus: ${list.status}`)];
  }
  const rows = [row('publicApi', 'public menu list', true, `${menus.length} public menus`)];

  let menusOk = 0;
  const cocktailIds = new Set();
  for (const menu of menus) {
    const detail = await request(`${backendUrl}/api/public/menus/${encodeURIComponent(menu.slug)}`);
    if (detail.status !== 200) continue;
    menusOk++;
    for (const item of parseJson(detail.body)?.cocktails ?? []) {
      cocktailIds.add(item.cocktailId ?? item.cocktail?.id);
    }
  }
  rows.push(row('publicApi', 'each public menu', menusOk === menus.length, `${menusOk}/${menus.length} in 200`));

  let cocktailsOk = 0;
  for (const id of cocktailIds) {
    const recipe = await request(`${backendUrl}/api/public/cocktails/${id}`);
    if (recipe.status === 200) cocktailsOk++;
  }
  rows.push(row('publicApi', 'each cocktail of a public menu', cocktailsOk === cocktailIds.size,
    `${cocktailsOk}/${cocktailIds.size} in 200`));
  return rows;
}

export async function checkFrontendShell(frontendUrl) {
  const shell = await request(`${frontendUrl}/`);
  const isHtml = shell.body.toString('utf8').includes('<div id="root"');
  return row('frontend', 'frontend serves the app', shell.status === 200 && isHtml, `GET /: ${shell.status}`);
}

function uploadUrl(baseUrl, imagePath) {
  const name = imagePath.replace(/^\/+/, '').replace(/^uploads\//, '');
  return `${baseUrl}/uploads/${name.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Every photo referenced by a cocktail, through one server (backend or frontend nginx). The two
 * servers report in separate groups (`images`, `frontendImages`): a release note can then expect
 * the nginx route to break (frontend port change) without hiding a backend photo failure.
 */
export async function checkImages(group, baseUrl, imagePaths, serverLabel) {
  let served = 0;
  const statuses = {};
  for (const imagePath of imagePaths) {
    const image = await request(uploadUrl(baseUrl, imagePath));
    const ok = image.status === 200 && image.body.length > 0;
    if (ok) served++;
    statuses[image.status] = (statuses[image.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(statuses).map(([status, count]) => `${count}x ${status}`).join(', ');
  return row(group, `photos via ${serverLabel}`, served === imagePaths.length,
    `${served}/${imagePaths.length} in 200 (${byStatus || 'none referenced'})`);
}

/** The upload folder of the running version must be a mount, or photos die with the container. */
export function checkUploadsPersistent(mounts, uploadDir) {
  const mount = mounts.find((candidate) => uploadDir === candidate.Destination
    || uploadDir.startsWith(`${candidate.Destination.replace(/\/$/, '')}/`));
  const detail = mount
    ? `${uploadDir} is on a ${mount.Type} mount`
    : `${uploadDir} is inside the container (mounts: ${mounts.map((m) => m.Destination).join(', ') || 'none'})`;
  return row('uploadsPersistent', 'upload folder survives a container recreation', Boolean(mount), detail);
}

export function checkRowCounts(baseline, current) {
  const lost = [];
  const changed = [];
  for (const [table, before] of Object.entries(baseline.counts)) {
    const after = current.counts[table];
    if (after === undefined || after < before) lost.push(`${table} ${before} -> ${after ?? 'missing'}`);
    else if (after !== before) changed.push(`${table} +${after - before}`);
  }
  const added = Object.keys(current.counts).filter((table) => !(table in baseline.counts));
  const total = Object.values(current.counts).reduce((sum, count) => sum + count, 0);
  const notes = [
    `${Object.keys(baseline.counts).length} tables, ${total} rows`,
    lost.length ? `lost: ${lost.join(', ')}` : 'no loss',
    changed.length ? `grew: ${changed.join(', ')}` : null,
    added.length ? `new tables: ${added.map((t) => `${t} (${current.counts[t]})`).join(', ')}` : null,
  ];
  return row('rowCounts', 'row count of each table vs the fixture', lost.length === 0, notes.filter(Boolean).join('; '));
}

// Clean refusals of the entrypoint (backend/docker-entrypoint.sh). A hook file lists the ones
// its release adds in `profile.refusals`; `database` says what the refused start may change
// (see checkRefusedDatabase).

/** v1.6.0: a database created by `db push` that does not match the 0_init baseline. */
export const BASELINE_REFUSAL = { log: 'does not match migration 0_init', database: 'untouched' };

/**
 * C-18: a migration failed (P3018), or failed at an earlier start (P3009, every restart). The
 * message names the migration; the 0_init refusal says "will not start, and" instead.
 */
export const FAILED_MIGRATION_REFUSAL = { log: 'failed. The backend will not start.', database: 'backupBeforeJump' };

/** The first refusal of `refusals` (`profile.refusals`) whose message is in the logs, or null. */
export function findRefusal(refusals, logs) {
  return refusals.find((refusal) => logs.includes(refusal.log)) ?? null;
}

export function checkRefusalMessage(refusals, refusal) {
  if (refusals.length === 0) return infoRow('refusal', 'refusal message', 'no refusal message defined for this version');
  if (refusal) return row('refusal', 'refusal message', true, `"${refusal.log}" found`);
  return row('refusal', 'refusal message', false, `none found: ${refusals.map((candidate) => `"${candidate.log}"`).join(', ')}`);
}

/**
 * What a refused start may change in the database, compared with the snapshot taken before it:
 * - `untouched`: nothing (the 0_init baseline refuses before writing anything);
 * - `backupBeforeJump`: the failed migration and its history row stay in the database (SQLite
 *   migrations are not transactional), so the newest pre-migrate copy must hold the database
 *   as it was before the jump. Row counts are checked separately, for every start.
 * An unrecognised refusal gets the strictest check.
 */
export function checkRefusedDatabase(refusal, before, after) {
  if (refusal?.database === 'backupBeforeJump') {
    const matches = after.latestBackupFingerprint === before.fingerprint;
    let detail = 'no pre-migrate copy';
    if (after.latestBackupFingerprint) {
      detail = matches ? 'same SHA-256 as the database before the jump' : 'SHA-256 differs from the database before the jump';
    }
    return row('refusal', 'newest pre-migrate copy holds the database before the jump', matches, detail);
  }
  const untouched = after.fingerprint === before.fingerprint;
  return row('refusal', 'database left untouched by the refused start', untouched,
    untouched ? 'same SHA-256 as before the jump' : 'database file changed');
}

export function checkIntegrity(snapshot) {
  return row('integrity', 'PRAGMA integrity_check', snapshot.integrity === 'ok', snapshot.integrity);
}

export function checkJournalMode(snapshot, expected) {
  return row('journalMode', `journal mode is ${expected}`, snapshot.journalMode === expected, snapshot.journalMode);
}
