import { describe, it, expect } from 'vitest';
import { isBottleMenu } from './menuType';

describe('isBottleMenu', () => {
  it('recognises the aperitifs and digestifs types only', () => {
    expect(isBottleMenu({ type: 'APEROS' })).toBe(true);
    expect(isBottleMenu({ type: 'DIGESTIFS' })).toBe(true);
    expect(isBottleMenu({ type: 'COCKTAILS' })).toBe(false);
  });
});
