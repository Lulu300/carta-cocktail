import { describe, it, expect } from 'vitest';
import { cx } from './classNames';

describe('cx', () => {
  it('joins the truthy class names only', () => {
    const disabled = false;
    expect(cx('a', disabled && 'b', null, undefined, '', 'c')).toBe('a c');
  });
});
