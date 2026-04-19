import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import CocktailPublicPage from './CocktailPublicPage';

const mockGetCocktail = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../services/api', () => ({
  publicApi: { getCocktail: (...args: unknown[]) => mockGetCocktail(...args) },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name?: string }) => entity?.name || '',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '42', slug: 'summer-menu' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../components/ui/UnitConverter', () => ({
  default: ({ quantity, unit }: { quantity: number; unit: string }) => <span>{quantity} {unit}</span>,
}));

vi.mock('../../components/ui/ExportCocktailButton', () => ({
  default: () => <button type="button">export</button>,
}));

const cocktailResponse = {
  id: 42,
  name: 'Negroni',
  description: 'Bitter and bright',
  notes: 'Use the large mixing glass.',
  imagePath: 'cocktails/negroni.jpg',
  tags: 'classic,bitter',
  isAvailable: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ingredients: [
    {
      id: 1,
      cocktailId: 42,
      quantity: 30,
      unitId: 1,
      unit: { id: 1, name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 },
      sourceType: 'CATEGORY' as const,
      bottleId: null,
      categoryId: 10,
      category: { id: 10, name: 'Vermouth', type: 'SPIRIT', desiredStock: 1, minimumPercent: 0, createdAt: '2024-01-01' },
      ingredientId: null,
      position: 0,
      preferredBottles: [
        {
          id: 8,
          cocktailIngredientId: 1,
          bottleId: 100,
          bottle: {
            id: 100,
            name: 'Cocchi Vermouth di Torino',
            categoryId: 10,
            capacityMl: 750,
            remainingPercent: 100,
            purchasePrice: null,
            openedAt: null,
            alcoholPercentage: null,
            location: null,
            isApero: false,
            isDigestif: false,
            createdAt: '2024-01-01',
          },
        },
      ],
    },
  ],
  instructions: [
    { id: 1, cocktailId: 42, stepNumber: 1, text: 'Stir with ice.' },
  ],
};

describe('CocktailPublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCocktail.mockResolvedValue(cocktailResponse);
  });

  it('shows notes and preferred bottles for logged-in admins', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'admin@test.local' } });

    render(<CocktailPublicPage />);

    await waitFor(() => {
      expect(screen.getByText('Negroni')).toBeInTheDocument();
    });

    expect(screen.getByText('cocktails.notes')).toBeInTheDocument();
    expect(screen.getByText('Use the large mixing glass.')).toBeInTheDocument();
    expect(screen.getByText('cocktails.preferredBottles')).toBeInTheDocument();
    expect(screen.getByText('Cocchi Vermouth di Torino')).toBeInTheDocument();
  });

  it('keeps admin-only notes hidden for public visitors', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    render(<CocktailPublicPage />);

    await waitFor(() => {
      expect(screen.getByText('Negroni')).toBeInTheDocument();
    });

    expect(screen.queryByText('Use the large mixing glass.')).not.toBeInTheDocument();
    expect(screen.queryByText('Cocchi Vermouth di Torino')).not.toBeInTheDocument();
  });
});
