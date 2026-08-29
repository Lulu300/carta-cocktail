import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Menu } from '../../types';
import MenuPublicPage from './MenuPublicPage';

vi.mock('../../services/api', () => ({
  publicApi: { getMenu: vi.fn() },
  availability: { getAllCocktails: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (
    entity: { name: string; nameTranslations?: Record<string, string> | null },
  ) => entity.nameTranslations?.fr || entity.name,
}));

import { availability, publicApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const bottleMenu = {
  id: 1,
  name: 'Apéritifs',
  description: null,
  slug: 'aperitifs',
  type: 'APEROS',
  isPublic: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  sections: [],
  cocktails: [],
  bottles: [1, 2].map((id) => ({
    id,
    menuId: 1,
    bottleId: id,
    menuSectionId: null,
    position: id,
    isHidden: false,
    bottle: {
      id,
      name: 'Suze',
      categoryId: 1,
      category: {
        id: 1,
        name: 'Amer',
        type: 'SPIRIT',
        desiredStock: 1,
        minimumPercent: 30,
        createdAt: '2024-01-01',
      },
      purchasePrice: null,
      capacityMl: 700,
      remainingPercent: 100,
      openedAt: null,
      alcoholPercentage: 20,
      location: 'B57',
      isApero: true,
      isDigestif: false,
      createdAt: '2024-01-01',
    },
  })),
} satisfies Menu;

const cocktailMenu = {
  id: 2,
  name: 'Cocktails',
  description: null,
  slug: 'cocktails',
  type: 'COCKTAILS',
  isPublic: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  sections: [],
  bottles: [],
  cocktails: [
    {
      id: 1,
      menuId: 2,
      cocktailId: 1,
      menuSectionId: null,
      position: 0,
      isHidden: false,
      cocktail: {
        id: 1,
        name: 'Mojito',
        description: 'Frais et pétillant',
        notes: null,
        imagePath: null,
        tags: 'rhum,tiki',
        isAvailable: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        ingredients: [{
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
        }],
        instructions: [{ id: 1, cocktailId: 1, stepNumber: 1, text: 'Shaker avec de la glace' }],
      },
    },
    {
      id: 2,
      menuId: 2,
      cocktailId: 2,
      menuSectionId: null,
      position: 1,
      isHidden: false,
      cocktail: {
        id: 2,
        name: 'Negroni',
        description: 'Amer',
        notes: null,
        imagePath: null,
        tags: 'gin',
        isAvailable: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        ingredients: [],
        instructions: [],
      },
    },
  ],
} satisfies Menu;

function renderMenu(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/menu/${slug}`]}>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPublicPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MenuPublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    });
    vi.mocked(availability.getAllCocktails).mockResolvedValue({});
  });

  it('shows the existing location badge and alcohol percentage when logged out', async () => {
    vi.mocked(publicApi.getMenu).mockResolvedValue(bottleMenu);
    renderMenu('aperitifs');

    expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
    expect(screen.getByText('20% vol.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cocktails.viewList' })).not.toBeInTheDocument();
  });

  it('keeps the same location badge and connected inventory details', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, email: 'admin@carta.local' },
      token: 'token',
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    });
    vi.mocked(publicApi.getMenu).mockResolvedValue(bottleMenu);
    renderMenu('aperitifs');

    expect(await screen.findByText('B57 (2)')).toBeInTheDocument();
    expect(screen.getByText('700 ml')).toBeInTheDocument();
    expect(screen.getByText('x2')).toBeInTheDocument();
  });

  it('switches a public cocktail menu between grid and list views', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApi.getMenu).mockResolvedValue(cocktailMenu);
    renderMenu('cocktails');

    expect(await screen.findByTestId('public-cocktails-grid-view')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));

    expect(screen.getByTestId('public-cocktails-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('public-cocktails-grid-view')).not.toBeInTheDocument();
  });

  it('matches all terms across tags, ingredients, and instructions', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApi.getMenu).mockResolvedValue(cocktailMenu);
    renderMenu('cocktails');

    const search = await screen.findByPlaceholderText('public.cocktailSearchPlaceholder');
    await user.type(search, 'rhum citron shaker');

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
      expect(screen.queryByText('Negroni')).not.toBeInTheDocument();
    });
  });
});
