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
