import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createTestQueryClient } from '../../test/test-utils';
import { installIntersectionObserverMock } from '../../test/intersectionObserverMock';
import {
  buildAvailability,
  buildCocktailIngredient,
  buildIngredient,
  buildMenu,
  buildMenuBottle,
  buildMenuCocktail,
  buildMenuSection,
} from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import type { Bottle, Menu, MenuBottle, MenuCocktail } from '../../types';
import { axe } from '../../test/axe';
import MenuPublicPage from './MenuPublicPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'fr' } }),
  };
});

import { useAuth } from '../../contexts/AuthContext';

const lime = buildCocktailIngredient({
  id: 1,
  ingredient: buildIngredient({ id: 1, name: 'Lime', nameTranslations: { fr: 'Citron vert' } }),
});

/** Entry `id` of the apéritifs menu, holding bottle `id`, a Suze unless told otherwise. */
function menuBottle(id: number, bottle: Partial<Bottle> = {}): MenuBottle {
  return buildMenuBottle({ id, bottle: { id, name: 'Suze', alcoholPercentage: 20, ...bottle } });
}

function bottleMenu(bottles: MenuBottle[]): Menu {
  return buildMenu({ id: 1, name: 'Apéritifs', slug: 'aperitifs', type: 'APEROS', bottles });
}

function cocktailMenu(cocktails: MenuCocktail[], overrides: Partial<Menu> = {}): Menu {
  return buildMenu({ id: 2, name: 'Cocktails', slug: 'cocktails', cocktails, ...overrides });
}

function mockMenu(menu: Menu) {
  mockApiResponse('get', '/api/public/menus/:slug', menu);
}

const suzeMenu = bottleMenu([1, 2].map((id) => menuBottle(id, { location: 'B57' })));

const mojitoMenu = cocktailMenu([
  buildMenuCocktail({
    id: 1,
    cocktail: {
      description: 'Frais et pétillant',
      tags: 'rhum,tiki',
      ingredients: [lime],
      instructions: [{ id: 1, cocktailId: 1, stepNumber: 1, text: 'Shaker avec de la glace' }],
    },
  }),
  buildMenuCocktail({ id: 2, cocktail: { name: 'Negroni', description: 'Amer', tags: 'gin' } }),
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
    installIntersectionObserverMock();
    signIn(false);
    mockApiResponse('get', '/api/availability/cocktails', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loading and errors', () => {
    it('shows a skeleton, not a loading text, while the menu loads', () => {
      mockApiPending('get', '/api/public/menus/:slug');
      renderMenu('aperitifs');

      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('common.loading')).toHaveClass('sr-only');
    });

    it('tells an unknown menu apart and links to the home page', async () => {
      const user = userEvent.setup();
      mockApiError('get', '/api/public/menus/:slug', 404, 'Not found');
      renderMenu('unknown');

      expect(await screen.findByRole('alert')).toHaveTextContent('public.menuNotFound');
      expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'public.backHome' }));
      expect(screen.getByText('home page')).toBeInTheDocument();
    });

    it('offers a retry when the menu cannot be loaded', async () => {
      const user = userEvent.setup();
      mockNetworkError('get', '/api/public/menus/:slug');
      renderMenu('cocktails');

      expect(await screen.findByRole('alert')).toHaveTextContent('public.menuLoadError');
      expect(screen.queryByText('public.menuNotFound')).not.toBeInTheDocument();

      mockMenu(mojitoMenu);
      const retried = captureRequest('get', '/api/public/menus/:slug');
      await user.click(screen.getByRole('button', { name: 'common.retry' }));

      expect(await screen.findByText('Mojito')).toBeInTheDocument();
      expect((await retried.url).pathname).toBe('/api/public/menus/cocktails');
    });
  });

  describe('bottle menus', () => {
    it('shows the location badge and alcohol percentage when logged out', async () => {
      mockMenu(suzeMenu);
      renderMenu('aperitifs');

      expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
      expect(screen.getByText('units.abv(20)')).toBeInTheDocument();
      expect(screen.queryByText('units.ml(700)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'cocktails.viewList' })).not.toBeInTheDocument();
    });

    it('adds the inventory details for a signed-in admin', async () => {
      signIn(true);
      mockMenu(suzeMenu);
      renderMenu('aperitifs');

      expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
      expect(screen.getByText('units.ml(700)')).toBeInTheDocument();
      expect(screen.getByText('×2')).toBeInTheDocument();
    });

    it('keeps the order of the bottles set in the admin', async () => {
      mockMenu(bottleMenu([
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
      mockMenu(bottleMenu([
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
      mockMenu(bottleMenu(
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
      mockMenu(mojitoMenu);
      renderMenu('cocktails');

      expect(await screen.findByTestId('public-cocktails-grid-view')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));

      expect(screen.getByTestId('public-cocktails-list-view')).toBeInTheDocument();
      expect(screen.queryByTestId('public-cocktails-grid-view')).not.toBeInTheDocument();
    });

    it('matches all terms across tags, ingredients, and instructions, and announces the count', async () => {
      const user = userEvent.setup();
      mockMenu(mojitoMenu);
      renderMenu('cocktails');

      await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'rhum citron shaker');

      await waitFor(() => expect(screen.queryByText('Negroni')).not.toBeInTheDocument());
      expect(screen.getByText('Mojito')).toBeInTheDocument();
      expect(await screen.findByText('common.resultCount(1)')).toHaveAttribute('aria-live', 'polite');
    });

    it('says when nothing matches and clears the search on request', async () => {
      const user = userEvent.setup();
      mockMenu(mojitoMenu);
      renderMenu('cocktails');

      await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'whisky');

      expect(await screen.findByText('public.noResults(whisky)')).toBeInTheDocument();
      expect(await screen.findByText('common.resultCount(0)')).toBeInTheDocument();

      await user.click(screen.getByText('common.clearSearch', { selector: 'button' }));

      expect(await screen.findByText('Negroni')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('public.cocktailSearchPlaceholder')).toHaveValue('');
    });

    it('clears the search with the icon inside the search bar, and gives the focus back to the field', async () => {
      const user = userEvent.setup();
      mockMenu(mojitoMenu);
      renderMenu('cocktails');
      const search = await screen.findByPlaceholderText('public.cocktailSearchPlaceholder');
      await user.type(search, 'negroni');

      await user.click(screen.getByRole('button', { name: 'common.clearSearch' }));

      expect(search).toHaveValue('');
      expect(search).toHaveFocus();
      expect(await screen.findByText('Mojito')).toBeInTheDocument();
    });

    it('says when the menu itself is empty', async () => {
      mockMenu(cocktailMenu([]));
      renderMenu('cocktails');

      expect(await screen.findByText('public.emptyMenu')).toBeInTheDocument();
    });

    it('shows the section navigation from two sections on', async () => {
      mockMenu(cocktailMenu(
        [
          buildMenuCocktail({ id: 1, menuSectionId: 10 }),
          buildMenuCocktail({ id: 2, cocktail: { name: 'Negroni' }, menuSectionId: 20 }),
          buildMenuCocktail({ id: 3, cocktail: { name: 'Spritz' }, menuSectionId: 30 }),
        ],
        { sections: [buildMenuSection({ id: 10, name: 'Classics' }), buildMenuSection({ id: 20, name: 'Signatures' }), buildMenuSection({ id: 30, name: 'Mocktails' })] },
      ));
      renderMenu('cocktails');

      const nav = await screen.findByRole('navigation', { name: 'public.sectionNav' });
      expect(within(nav).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Classics', 'Signatures', 'Mocktails']);
      expect(document.getElementById('section-20')).toHaveTextContent('Negroni');
    });

    it('has no section navigation with a single section', async () => {
      mockMenu(cocktailMenu(
        [buildMenuCocktail({ id: 1, menuSectionId: 10 })],
        { sections: [buildMenuSection({ id: 10, name: 'Classics' }), buildMenuSection({ id: 20, name: 'Empty' })] },
      ));
      renderMenu('cocktails');

      expect(await screen.findByText('Classics')).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('shows the stock of each cocktail to a signed-in admin only', async () => {
      signIn(true);
      mockApiResponse('get', '/api/availability/cocktails', { 1: buildAvailability({ cocktailId: 1, maxServings: 4 }) });
      mockMenu(mojitoMenu);
      renderMenu('cocktails');

      expect(await screen.findByText('public.servings(4)')).toBeInTheDocument();
    });

    it('does not request the stock for a guest', async () => {
      const stockRequests = captureRequest('get', '/api/availability/cocktails');
      mockMenu(mojitoMenu);
      renderMenu('cocktails');

      await screen.findByText('Mojito');
      expect(stockRequests.count()).toBe(0);
    });
  });
});

describe('MenuPublicPage accessibility', () => {
  beforeEach(() => {
    installIntersectionObserverMock();
    signIn(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has no serious accessibility violation on a cocktail menu, search in progress', async () => {
    const user = userEvent.setup();
    mockMenu(
      cocktailMenu([...mojitoMenu.cocktails!, buildMenuCocktail({ id: 3, cocktail: { name: 'Daiquiri', isAvailable: true, available: false } })]),
    );
    const { container } = renderMenu('cocktails');
    await user.type(await screen.findByPlaceholderText('public.cocktailSearchPlaceholder'), 'i');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no serious accessibility violation on a bottle menu', async () => {
    mockMenu(suzeMenu);
    const { container } = renderMenu('aperitifs');
    await screen.findAllByText(/B57/);

    expect(await axe(container)).toHaveNoViolations();
  });
});
