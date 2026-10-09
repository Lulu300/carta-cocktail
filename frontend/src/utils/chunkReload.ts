const LAST_RELOAD_KEY = 'chunkReloadAt';
// A second failure this soon after a reload means the fresh page is broken too:
// stop reloading so the visitor does not get stuck in a loop.
const RELOAD_GUARD_MS = 10_000;

type ReloadTarget = Pick<Window, 'addEventListener' | 'sessionStorage' | 'location' | 'navigator'>;

function reloadedRecently(storage: Storage, now: number): boolean {
  const lastReload = Number(storage.getItem(LAST_RELOAD_KEY));
  return now - lastReload < RELOAD_GUARD_MS;
}

/**
 * After a deployment, a page opened before it still references chunks that no
 * longer exist, so the next lazy route fails to load. Reload once to fetch the
 * new index.html and its chunks.
 */
export function registerChunkReloadHandler(target: ReloadTarget = window): void {
  target.addEventListener('vite:preloadError', () => {
    // Offline, the chunk is not missing but unreachable: a reload would only
    // replace the page with the browser's offline error.
    if (target.navigator.onLine === false) return;
    const now = Date.now();
    try {
      if (reloadedRecently(target.sessionStorage, now)) return;
      target.sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
    } catch {
      // Without storage there is no loop guard: let the error surface instead
      return;
    }
    target.location.reload();
  });
}
