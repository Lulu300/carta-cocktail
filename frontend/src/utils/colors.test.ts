import { describe, it, expect } from 'vitest';
import {
  CATEGORY_TYPE_COLORS, COLOR_BADGE_CLASSES, COLOR_DOT_CLASSES, getBadgeClasses,
} from './colors';

describe('CATEGORY_TYPE_COLORS', () => {
  it('should contain 10 colors', () => {
    expect(CATEGORY_TYPE_COLORS).toHaveLength(10);
  });

  it('should include expected colors', () => {
    expect(CATEGORY_TYPE_COLORS).toContain('blue');
    expect(CATEGORY_TYPE_COLORS).toContain('gray');
    expect(CATEGORY_TYPE_COLORS).toContain('teal');
  });
});

describe('COLOR_BADGE_CLASSES', () => {
  it('should have an entry for each color', () => {
    for (const color of CATEGORY_TYPE_COLORS) {
      expect(COLOR_BADGE_CLASSES[color]).toBeDefined();
    }
  });
});

describe('COLOR_DOT_CLASSES', () => {
  it('should have an entry for each color', () => {
    for (const color of CATEGORY_TYPE_COLORS) {
      expect(COLOR_DOT_CLASSES[color]).toBeDefined();
    }
  });
});

describe('getBadgeClasses', () => {
  it('should return classes for a known color', () => {
    expect(getBadgeClasses('blue')).toBe(COLOR_BADGE_CLASSES.blue);
  });

  it('should return gray classes for unknown color', () => {
    expect(getBadgeClasses('unknown')).toBe(COLOR_BADGE_CLASSES.gray);
  });

  it('should return gray classes for null', () => {
    expect(getBadgeClasses(null)).toBe(COLOR_BADGE_CLASSES.gray);
  });

  it('should return gray classes for undefined', () => {
    expect(getBadgeClasses(undefined)).toBe(COLOR_BADGE_CLASSES.gray);
  });
});
