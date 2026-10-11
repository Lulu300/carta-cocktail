import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/test-utils';
import { ApiError } from '../../services/api';
import CocktailPublicPage from './CocktailPublicPage';

const mockGetCocktail = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    publicApi: { getCocktail: (...args: unknown[]) => mockGetCocktail(...args) },
  };
});

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

  describe('back to the menu', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: null });
    });

    // BrowserRouter reads the location state from history.state.usr.
    function openFrom(state: unknown) {
      window.history.replaceState({ usr: state, key: 'cocktail', idx: 1 }, '', '/menu/summer-menu/cocktail/42');
    }

    it('is a real link to the menu, so it can open in a new tab', async () => {
      openFrom(null);
      render(<CocktailPublicPage />);

      const back = await screen.findByRole('link', { name: /public\.back/ });

      expect(back).toHaveAttribute('href', '/menu/summer-menu');
    });

    it('goes back in history when the guest came from the menu', async () => {
      const user = userEvent.setup();
      openFrom({ fromMenu: true });
      render(<CocktailPublicPage />);

      await user.click(await screen.findByRole('link', { name: /public\.back/ }));

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('follows the link when the page was opened directly', async () => {
      const user = userEvent.setup();
      openFrom(null);
      render(<CocktailPublicPage />);

      await user.click(await screen.findByRole('link', { name: /public\.back/ }));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/menu/summer-menu');
    });

    it('lets a modified click (new tab) through even when coming from the menu', async () => {
      const user = userEvent.setup();
      openFrom({ fromMenu: true });
      render(<CocktailPublicPage />);
      const back = await screen.findByRole('link', { name: /public\.back/ });

      await user.keyboard('{Control>}');
      await user.click(back);
      await user.keyboard('{/Control}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('loading and errors', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: null });
    });

    it('shows a skeleton while the recipe loads', () => {
      mockGetCocktail.mockReturnValue(new Promise(() => {}));
      render(<CocktailPublicPage />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('tells an unknown cocktail apart and links back to the menu', async () => {
      mockGetCocktail.mockRejectedValue(new ApiError(404, 'Not found'));
      render(<CocktailPublicPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('public.cocktailNotFound');
      expect(screen.getByRole('link', { name: 'public.back' })).toHaveAttribute('href', '/menu/summer-menu');
      expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument();
    });

    it('offers a retry when the recipe cannot be loaded', async () => {
      const user = userEvent.setup();
      mockGetCocktail.mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
      render(<CocktailPublicPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('public.cocktailLoadError');
      await user.click(screen.getByRole('button', { name: 'common.retry' }));

      expect(await screen.findByText('Negroni')).toBeInTheDocument();
    });
  });

  it('keeps export and print as secondary actions below the recipe', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: null });
    render(<CocktailPublicPage />);

    await user.click(await screen.findByRole('button', { name: /public\.print/ }));

    expect(print).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'export' })).toBeInTheDocument();
  });
});
