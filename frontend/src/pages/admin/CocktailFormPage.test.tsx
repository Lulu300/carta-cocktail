import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import CocktailFormPage from './CocktailFormPage';

const mockNavigate = vi.fn();

vi.mock('../../services/api', () => ({
  cocktails: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    uploadImage: vi.fn(),
  },
  categories: {
    list: vi.fn(),
  },
  bottles: {
    list: vi.fn(),
  },
  ingredients: {
    list: vi.fn(),
    create: vi.fn(),
  },
  units: {
    list: vi.fn(),
  },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name?: string }) => entity?.name || '',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({}),
    useNavigate: () => mockNavigate,
  };
});

import { categories, bottles, ingredients, units } from '../../services/api';

describe('CocktailFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categories.list).mockResolvedValue([
      {
        id: 1,
        name: 'Bourbon',
        type: 'SPIRIT',
        desiredStock: 1,
        minimumPercent: 0,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(bottles.list).mockResolvedValue([
      {
        id: 1,
        name: 'Buffalo Trace',
        categoryId: 1,
        capacityMl: 700,
        remainingPercent: 100,
        purchasePrice: null,
        openedAt: null,
        alcoholPercentage: null,
        location: null,
        isApero: false,
        isDigestif: false,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(ingredients.list).mockResolvedValue([
      {
        id: 1,
        name: 'Sugar syrup',
        icon: null,
        isAvailable: true,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(units.list).mockResolvedValue([
      {
        id: 1,
        name: 'Millilitre',
        abbreviation: 'ml',
        conversionFactorToMl: 1,
      },
    ]);
  });

  it('uses the responsive grid layout for ingredient rows', async () => {
    const user = userEvent.setup();

    render(<CocktailFormPage />);

    await waitFor(() => {
      expect(screen.getByText('cocktails.addIngredient')).toBeInTheDocument();
    });

    await user.click(screen.getByText('cocktails.addIngredient'));

    const ingredientFields = screen.getByTestId('ingredient-fields-0');
    expect(ingredientFields.className).toContain('md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_5.5rem_5.5rem_auto]');
  });
});
