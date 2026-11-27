import { vi } from 'vitest';

/**
 * Makes the page run as if it were embedded in an iframe of another site: `window.top` is no
 * longer the window itself. Undone by `vi.restoreAllMocks()`.
 */
export function simulateFrame() {
  vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
}
