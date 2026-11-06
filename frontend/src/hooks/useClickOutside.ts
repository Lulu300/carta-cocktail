import { useEffect, useRef } from 'react';

/**
 * Calls `handler` on a mouse or touch press outside the returned ref's element.
 * `enabled: false` removes the listeners, e.g. while a panel is closed.
 */
export function useClickOutside<T extends HTMLElement>(handler: () => void, enabled = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler, enabled]);

  return ref;
}
