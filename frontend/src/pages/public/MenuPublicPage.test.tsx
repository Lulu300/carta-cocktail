import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createTestQueryClient } from '../../test/test-utils';
import { installIntersectionObserverMock } from '../../test/intersectionObserverMock';
import {
  bottleMenu,
  cocktailMenu,
  menuBottle,
  menuCocktail,
  section,
} from '../../test/publicMenuFixtures';
import type { CocktailIngredient } from '../../types';
import { axe } from '../../test/axe';
import MenuPublicPage from './MenuPublicPage';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    publicApi: { getMenu: vi.fn() },
    availability: { getAllCocktails: vi.fn() },
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (
    entity: { name: string; nameTranslations?: Record<string, string> | null },
  ) => entity.nameTranslations?.fr || entity.name,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'fr' } }),
  };
});

import { ApiError, availability, publicApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const lime: CocktailIngredient = {
  id: 1,
  cocktailId: 1,
  quantity: 2,
  unitId: 1,
  sourceType: 'INGREDIENT',
  bottleId: null,
  categoryId: null,
  ingredientId: 1,
  ingredient: {
    id: 1,
    name: 'Lime',
    nameTranslations: { fr: 'Citron vert' },
    icon: null,
    isAvailable: true,
    createdAt: '2024-01-01',
  },
  position: 0,
};

const suzeMenu = bottleMenu([1, 2].map((id) => menuBottle(id, { location: 'B57' })));

const mojitoMenu = cocktailMenu([
  menuCocktail(1, {
    description: 'Frais et pétillant',
    tags: 'rhum,tiki',
    ingredients: [lime],
    instructions: [{ id: 1, cocktailId: 1, stepNumber: 1, text: 'Shaker avec de la glace' }],
  }),
  menuCocktail(2, { name: 'Negroni', description: 'Amer', tags: 'gin' }),
]);

function signIn(isAdmin: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    user: isAdmin ? { id: 1, email: 'admin@carta.local' } : null,
    token: isAdmin ? 'token' : null,
    login: vi.fn(),
    logout: vi.fn(),
    updateSession: vi.fn(),
    isLoading: false,
  });
}

function renderMenu(slug: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/menu/${slug}`]}>
        <Routes>
          <Route path="/menu/:slug" element={<MenuPublicPage />} />
          <Route path="/" element={<p>home page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MenuPublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIntersectionObserverMock();
    signIn(false);
    vi.mocked(availability.getAllCocktails).mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loading and errors', () => {
    it('shows a skeleton, not a loading text, while the menu loads', () => {
      vi.mocked(publicApi.getMenu).mockReturnValue(new Promise(() => {}));
      renderMenu('aperitifs');

      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('common.loading')).toHaveClass('sr-only');
    });

    it('tells an unknown menu apart and links to the home page', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockRejectedValue(new ApiError(404, 'Not found'));
      renderMenu('unknown');

      expect(await screen.findByRole('alert')).toHaveTextContent('public.menuNotFound');
      expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'public.backHome' }));
      expect(screen.getByText('home page')).toBeInTheDocument();
    });

    it('offers a retry when the menu cannot be loaded', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      vi.mocked(publicApi.getMenu).mockResolvedValueOnce(mojitoMenu);
      renderMenu('cocktails');

      expect(await screen.findByRole('alert')).toHaveTextContent('public.menuLoadError');
      expect(screen.queryByText('public.menuNotFound')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'common.retry' }));

      expect(await screen.findByText('Mojito')).toBeInTheDocument();
      expect(publicApi.getMenu).toHaveBeenCalledTimes(2);
    });
  });

  describe('bottle menus', () => {
    it('shows the location badge and alcohol percentage when logged out', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(suzeMenu);
      renderMenu('aperitifs');

      expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
      expect(screen.getByText('public.alcoholPercentage(20)')).toBeInTheDocument();
      expect(screen.queryByText('public.capacityMl(700)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'cocktails.viewList' })).not.toBeInTheDocument();
    });

    it('adds the inventory details for a signed-in admin', async () => {
      signIn(true);
      vi.mocked(publicApi.getMenu).mockResolvedValue(suzeMenu);
      renderMenu('aperitifs');

      expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
      expect(screen.getByText('public.capacityMl(700)')).toBeInTheDocument();
      expect(screen.getByText('x2')).toBeInTheDocument();
    });

    it('keeps the order of the bottles set in the admin', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(bottleMenu([
        menuBottle(1, { name: 'Zubrowka' }),
        menuBottle(2, { name: 'Aperol' }),
        menuBottle(3, { name: 'Lillet' }),
      ]));
      renderMenu('aperitifs');

      await screen.findByText('Zubrowka');
      const rows = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
      expect(rows).toEqual(['Zubrowka', 'Aperol', 'Lillet']);
    });

    it('finds "Apéro" when typing "apero"', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(bottleMenu([
        menuBottle(1, { name: 'Apéro maison' }),
        menuBottle(2, { name: 'Lillet' }),
      ]));
      renderMenu('aperitifs');

      await user.type(await screen.findByPlaceholderText('public.bottleSearchPlaceholder'), 'apero');

      await waitFor(() => expect(screen.queryByText('Lillet')).not.toBeInTheDocument());
      expect(screen.getByText('Apéro maison')).toBeInTheDocument();
    });

    it('lists every location of a bottle in a dialog', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(bottleMenu(
        ['Cave', 'Bar', 'Salon', 'Garage'].map((location, index) => menuBottle(index + 1, { location })),
      ));
      renderMenu('aperitifs');

      await user.click(await screen.findByRole('button', { name: 'public.showAllLocations(4)' }));

      const dialog = screen.getByRole('dialog', { name: 'Suze' });
      expect(within(dialog).getByText('Garage')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'common.close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('cocktail menus', () => {
    it('switches between grid and list views', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');

      expect(await screen.findByTestId('public-cocktails-grid-view')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));

      expect(screen.getByTestId('public-cocktails-list-view')).toBeInTheDocument();
      expect(screen.queryByTestId('public-cocktails-grid-view')).not.toBeInTheDocument();
    });

    it('matches all terms across tags, ingredients, and instructions, and announces the count', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');

      await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'rhum citron shaker');

      await waitFor(() => expect(screen.queryByText('Negroni')).not.toBeInTheDocument());
      expect(screen.getByText('Mojito')).toBeInTheDocument();
      expect(screen.getByText('public.resultCount(1)')).toHaveAttribute('aria-live', 'polite');
    });

    it('says when nothing matches and clears the search on request', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');

      await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'whisky');

      expect(await screen.findByText('public.noResults(whisky)')).toBeInTheDocument();
      expect(screen.getByText('public.resultCount(0)')).toBeInTheDocument();

      await user.click(screen.getByText('public.clearSearch', { selector: 'button' }));

      expect(await screen.findByText('Negroni')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('public.cocktailSearchPlaceholder')).toHaveValue('');
    });

    it('clears the search with the icon inside the search bar', async () => {
      const user = userEvent.setup();
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');
      const search = await screen.findByPlaceholderText('public.cocktailSearchPlaceholder');
      await user.type(search, 'negroni');

      await user.click(screen.getByRole('button', { name: 'public.clearSearch' }));

      expect(search).toHaveValue('');
      expect(await screen.findByText('Mojito')).toBeInTheDocument();
    });

    it('says when the menu itself is empty', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(cocktailMenu([]));
      renderMenu('cocktails');

      expect(await screen.findByText('public.emptyMenu')).toBeInTheDocument();
    });

    it('shows the section navigation from two sections on', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(cocktailMenu(
        [
          menuCocktail(1, {}, { menuSectionId: 10 }),
          menuCocktail(2, { name: 'Negroni' }, { menuSectionId: 20 }),
          menuCocktail(3, { name: 'Spritz' }, { menuSectionId: 30 }),
        ],
        { sections: [section(10, 'Classics'), section(20, 'Signatures'), section(30, 'Mocktails')] },
      ));
      renderMenu('cocktails');

      const nav = await screen.findByRole('navigation', { name: 'public.sectionNav' });
      expect(within(nav).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Classics', 'Signatures', 'Mocktails']);
      expect(document.getElementById('section-20')).toHaveTextContent('Negroni');
    });

    it('has no section navigation with a single section', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(cocktailMenu(
        [menuCocktail(1, {}, { menuSectionId: 10 })],
        { sections: [section(10, 'Classics'), section(20, 'Empty')] },
      ));
      renderMenu('cocktails');

      expect(await screen.findByText('Classics')).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('shows the stock of each cocktail to a signed-in admin only', async () => {
      signIn(true);
      vi.mocked(availability.getAllCocktails).mockResolvedValue({
        1: { cocktailId: 1, isAvailable: true, maxServings: 4, ingredients: [], missingIngredients: [], lowStockWarnings: [] },
      });
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');

      expect(await screen.findByText('public.servings(4)')).toBeInTheDocument();
    });

    it('does not request the stock for a guest', async () => {
      vi.mocked(publicApi.getMenu).mockResolvedValue(mojitoMenu);
      renderMenu('cocktails');

      await screen.findByText('Mojito');
      expect(availability.getAllCocktails).not.toHaveBeenCalled();
    });
  });
});

describe('MenuPublicPage accessibility', () => {
  beforeEach(() => {
    installIntersectionObserverMock();
    signIn(false);
    vi.mocked(availability.getAllCocktails).mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has no serious accessibility violation on a cocktail menu, search in progress', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApi.getMenu).mockResolvedValue(
      cocktailMenu([...mojitoMenu.cocktails!, menuCocktail(3, { name: 'Daiquiri', isAvailable: true, available: false })]),
    );
    const { container } = renderMenu('cocktails');
    await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'i');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no serious accessibility violation on a bottle menu', async () => {
    vi.mocked(publicApi.getMenu).mockResolvedValue(suzeMenu);
    const { container } = renderMenu('aperitifs');
    await screen.findAllByText(/B57/);

    expect(await axe(container)).toHaveNoViolations();
  });
});
