import { expect } from 'vitest';
import { configureAxe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import type { AxeMatchers } from 'vitest-axe/matchers';

expect.extend(matchers);

// vitest-axe 0.1 declares its matcher on the old global `Vi` namespace: declare it on vitest's types.
// The type parameters must repeat vitest's own declaration, even unused.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends AxeMatchers {}
}

/**
 * axe for the page tests: `expect(await axe(container)).toHaveNoViolations()`.
 * Only serious and critical violations fail a test. jsdom computes no colours, so
 * the contrast rule is off: contrast is measured with Lighthouse in a browser.
 */
export const axe = configureAxe({
  impactLevels: ['serious', 'critical'],
  rules: { 'color-contrast': { enabled: false } },
} as Parameters<typeof configureAxe>[0]);
