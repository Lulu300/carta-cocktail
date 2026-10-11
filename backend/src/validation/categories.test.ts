import { describe, it, expect } from 'vitest';
import { CategoryCreate } from './categories';

describe('CategoryCreate', () => {
  it('keeps a desired stock of 0', () => {
    expect(CategoryCreate.parse({ name: 'Rum', type: 'SPIRIT', desiredStock: 0 }).desiredStock).toBe(0);
  });

  it.each([
    ['desiredStock', -1],
    ['desiredStock', 1.5],
    ['minimumPercent', 101],
  ])('rejects %s = %s', (field, value) => {
    expect(CategoryCreate.safeParse({ name: 'Rum', type: 'SPIRIT', [field]: value }).success).toBe(false);
  });
});
