import { vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

/**
 * Stands for virtual:pwa-register (alias in vitest.config.ts), which vite-plugin-pwa only
 * generates at build time: registers nothing, and records the call.
 */
export const registerSW = vi.fn<(options?: RegisterSWOptions) => () => Promise<void>>(
  () => async () => {},
);
