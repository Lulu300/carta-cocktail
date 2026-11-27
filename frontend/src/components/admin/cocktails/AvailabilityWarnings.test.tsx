import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AvailabilityWarnings from './AvailabilityWarnings';
import { buildAvailability } from '../../../test/factories';
import type { IngredientAvailability } from '../../../types';
import i18n from '../../../i18n';

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

function line(overrides: Partial<IngredientAvailability>): IngredientAvailability {
  return {
    cocktailIngredientId: 1,
    sourceType: 'INGREDIENT',
    name: 'Bitters',
    nameTranslations: { fr: 'Amer' },
    orphan: false,
    icon: null,
    quantity: 1,
    unit: 'cl',
    isAvailable: false,
    availableCount: 0,
    ...overrides,
  };
}

describe('AvailabilityWarnings', () => {
  it('shows the names in the interface language and passes the serving count to the plural key', () => {
    const availability = buildAvailability({
      lowStock: [{ name: 'Sugar syrup', nameTranslations: { fr: 'Sirop de sucre' }, servings: 1 }],
      ingredients: [line({})],
    });
    render(<AvailabilityWarnings availability={availability} loading={false} />);

    expect(screen.getByText('Sirop de sucre : plus que 1 dose')).toBeInTheDocument();
    expect(screen.getByText('Amer')).toBeInTheDocument();
  });

  it('names an orphan line with the unknown source label', () => {
    const availability = buildAvailability({
      ingredients: [line({ name: '', nameTranslations: null, orphan: true })],
    });
    render(<AvailabilityWarnings availability={availability} loading={false} />);

    expect(screen.getByText('Source inconnue')).toBeInTheDocument();
  });

  it('shows nothing while loading', () => {
    const { container } = render(
      <AvailabilityWarnings availability={buildAvailability()} loading />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
