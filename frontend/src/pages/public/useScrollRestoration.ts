import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_PREFIX = 'carta:scroll:';

function readPosition(locationKey: string): number | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_PREFIX + locationKey);
    return saved === null ? null : Number(saved);
  } catch {
    // Storage can be blocked (private browsing): restoration is only a comfort.
    return null;
  }
}

function savePosition(locationKey: string, position: number) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + locationKey, String(position));
  } catch {
    // Same as above: losing the position is acceptable.
  }
}

// React Router keys the first history entry of every page load "default",
// whatever the page: a position saved under that key by an earlier load in
// this tab (a pasted link, a QR code) would be stale. A reload stays on the
// same entry, so its position is kept. Pushed entries have unique keys kept
// in history.state, so their positions stay valid.
const DOCUMENT_START_KEY = 'default';

function isReload(): boolean {
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return navigation?.type === 'reload';
}

/** Drops the position an earlier page load left under the document start key. */
export function forgetStalePositions() {
  if (isReload()) return;
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + DOCUMENT_START_KEY);
  } catch {
    // Nothing was saved if the storage is blocked.
  }
}

// Once per page load, when this module is evaluated.
forgetStalePositions();

/**
 * Keeps the scroll position of a page across history navigation.
 * The position is saved per history entry when leaving the page, and restored on
 * back/forward once the page content is rendered (`ready`). A new navigation
 * starts at the top, even when the content comes from the cache.
 */
export function useScrollRestoration(ready: boolean) {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const handledKey = useRef<string | null>(null);

  // A layout cleanup runs before the page is removed from the DOM: the document
  // still has its full height, so the browser has not clamped the position yet.
  useLayoutEffect(() => () => savePosition(key, window.scrollY), [key]);

  useLayoutEffect(() => {
    if (handledKey.current === key) return;
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    } else {
      if (!ready) return;
      const saved = readPosition(key);
      if (saved !== null) window.scrollTo(0, saved);
    }
    handledKey.current = key;
  }, [key, navigationType, ready]);
}
