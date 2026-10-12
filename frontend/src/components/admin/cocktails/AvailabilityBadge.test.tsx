import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CocktailAvailability } from '../../../types';
import AvailabilityBadge from './AvailabilityBadge';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

function availability(overrides: Partial<CocktailAvailability>): CocktailAvailability {
  return {
    cocktailId: 1,
    isAvailable: true,
    maxServings: 5,
    ingredients: [],
    missingIngredients: [],
    lowStockWarnings: [],
    ...overrides,
  };
}

describe('AvailabilityBadge', () => {
  it.each([
    ['while loading', availability({}), true, '...'],
    ['without availability', undefined, false, '...'],
    ['for an unavailable cocktail', availability({ isAvailable: false, maxServings: 0 }), false, 'cocktails.unavailable'],
    ['for a single serving', availability({ maxServings: 1 }), false, 'cocktails.doses(1,1)'],
    ['for unlimited servings', availability({ maxServings: 999 }), false, 'cocktails.doses(999,∞)'],
  ])('shows the right text %s', (_case, value, loading, text) => {
    render(<AvailabilityBadge availability={value} loading={loading} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('warns when only a few servings are left', () => {
    render(<AvailabilityBadge availability={availability({ maxServings: 3 })} loading={false} />);
    expect(screen.getByText('cocktails.doses(3,3)').className).toContain('text-warning');
  });
});
