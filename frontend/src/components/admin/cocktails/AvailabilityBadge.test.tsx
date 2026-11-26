import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CocktailAvailability } from '../../../types';
import AvailabilityBadge from './AvailabilityBadge';

function availability(overrides: Partial<CocktailAvailability>): CocktailAvailability {
  return {
    cocktailId: 1,
    isAvailable: true,
    maxServings: 5,
    ingredients: [],
    lowStock: [],
    ...overrides,
  };
}

describe('AvailabilityBadge', () => {
  it.each([
    ['while loading', availability({}), true, '...'],
    ['without availability', undefined, false, '...'],
    ['for an unavailable cocktail', availability({ isAvailable: false, maxServings: 0 }), false, 'Unavailable'],
    ['for a single serving', availability({ maxServings: 1 }), false, '1 serving'],
    ['for unlimited servings', availability({ maxServings: 999 }), false, '∞ servings'],
  ])('shows the right text %s', (_case, value, loading, text) => {
    render(<AvailabilityBadge availability={value} loading={loading} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('warns when only a few servings are left', () => {
    render(<AvailabilityBadge availability={availability({ maxServings: 3 })} loading={false} />);
    expect(screen.getByText('3 servings').className).toContain('text-warning');
  });
});
