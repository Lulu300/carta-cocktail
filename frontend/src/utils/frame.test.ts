import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInFrame, outsideFrameTarget } from './frame';
import { simulateFrame } from '../test/frame';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isInFrame', () => {
  it('is false in a top-level window', () => {
    expect(isInFrame()).toBe(false);
    expect(outsideFrameTarget()).toBeUndefined();
  });

  it('is true when the window has another top window', () => {
    simulateFrame();
    expect(isInFrame()).toBe(true);
    expect(outsideFrameTarget()).toBe('_top');
  });
});
