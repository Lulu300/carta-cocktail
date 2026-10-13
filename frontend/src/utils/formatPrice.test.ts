import { describe, expect, it } from 'vitest';
import { formatPrice } from './formatPrice';

// Intl separates the French amount and symbol with a narrow no-break space.
const normalizeSpaces = (text: string) => text.replace(/\s/g, ' ');

describe('formatPrice', () => {
  it('writes euros the English way', () => {
    expect(formatPrice(12.5, 'en')).toBe('€12.50');
  });

  it('writes euros the French way', () => {
    expect(normalizeSpaces(formatPrice(12.5, 'fr'))).toBe('12,50 €');
  });
});
