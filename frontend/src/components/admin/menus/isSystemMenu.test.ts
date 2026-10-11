import { describe, it, expect } from 'vitest';
import { isSystemMenu } from './isSystemMenu';

describe('isSystemMenu', () => {
  it('recognises the aperitifs and digestifs menus created by the backend', () => {
    expect(isSystemMenu({ slug: 'aperitifs' })).toBe(true);
    expect(isSystemMenu({ slug: 'digestifs' })).toBe(true);
  });

  it('treats any other menu as a menu of the admin', () => {
    expect(isSystemMenu({ slug: 'summer' })).toBe(false);
    expect(isSystemMenu({ slug: 'aperitifs-2' })).toBe(false);
  });
});
