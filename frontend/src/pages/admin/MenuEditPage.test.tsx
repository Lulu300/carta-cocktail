import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import MenuEditPage from './MenuEditPage';
import type { Cocktail, Menu, MenuCocktail, MenuInput, MenuSection } from '../../types';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    menus: { get: vi.fn(), update: vi.fn() },
    cocktails: { list: vi.fn() },
    menuSections: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  };
});

import { ApiError, cocktails as cocktailsApi, menus as menusApi } from '../../services/api';

const classics: MenuSection = { id: 7, menuId: 3, name: 'Classics', position: 0 };

function makeCocktail(id: number, name: string): Cocktail {
  return {
    id, name, description: null, notes: null, imagePath: null, tags: '', isAvailable: true,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  } as Cocktail;
}

function makeEntry(cocktail: Cocktail, position: number, menuSectionId: number | null = null): MenuCocktail {
  return { id: 100 + cocktail.id, menuId: 3, cocktailId: cocktail.id, cocktail, menuSectionId, position, isHidden: false };
}

const mojito = makeCocktail(1, 'Mojito');
const negroni = makeCocktail(2, 'Negroni');
const spritz = makeCocktail(3, 'Spritz');

function makeMenu(cocktails: MenuCocktail[], sections: MenuSection[] = [classics]): Menu {
  return {
    id: 3, name: 'Summer', description: null, slug: 'summer', type: 'COCKTAILS', isPublic: false,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', sections, cocktails,
  };
}

function renderPage() {
  window.history.pushState({}, '', '/admin/menus/3');
  return renderWithFeedback(
    <Routes>
      <Route path="/admin/menus/:id" element={<MenuEditPage />} />
    </Routes>,
  );
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

function sentCocktails(call = 0) {
  return vi.mocked(menusApi.update).mock.calls[call][1].cocktails ?? [];
}

function sentCocktailIds(call = 0) {
  return sentCocktails(call).map((item) => item.cocktailId);
}

const ALL_COCKTAILS = [mojito, negroni, spritz];

/** What the server stores: a refetch after a save returns the saved composition. */
let storedMenu: Menu;

function storeCocktails(items: NonNullable<Partial<MenuInput>['cocktails']>) {
  storedMenu = {
    ...storedMenu,
    cocktails: items.map((item, index) => ({
      ...makeEntry(ALL_COCKTAILS.find((cocktail) => cocktail.id === item.cocktailId) as Cocktail, index, item.menuSectionId ?? null),
      isHidden: item.isHidden ?? false,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storedMenu = makeMenu([makeEntry(mojito, 0), makeEntry(negroni, 1)]);
  vi.mocked(menusApi.get).mockImplementation(async () => storedMenu);
  vi.mocked(menusApi.update).mockImplementation(async (_id, data) => {
    if (data.cocktails) storeCocktails(data.cocktails);
    return storedMenu;
  });
  vi.mocked(cocktailsApi.list).mockResolvedValue(ALL_COCKTAILS);
});

afterEach(clearToasts);

describe('MenuEditPage', () => {
  it('shows the menu info and its cocktails', async () => {
    renderPage();

    expect(await screen.findByText('Mojito')).toBeInTheDocument();
    expect(menusApi.get).toHaveBeenCalledWith(3);
    expect(screen.getByDisplayValue('Summer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('summer')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('link', { name: /menus.backToList/ })).toHaveAttribute('href', '/admin/menus');
  });

  it('saves the section of a cocktail at once, with every cocktail of the menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.selectOptions(within(rowOf('Negroni')).getByRole('combobox', { name: 'menus.sections.select' }), '7');

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledTimes(1));
    expect(sentCocktails()).toEqual([
      { cocktailId: 1, position: 0, isHidden: false, menuSectionId: null },
      { cocktailId: 2, position: 1, isHidden: false, menuSectionId: 7 },
    ]);
    expect(within(screen.getByText('Classics', { selector: 'h3' }).closest('section') as HTMLElement).getByText('Negroni'))
      .toBeInTheDocument();
  });

  it('adds a cocktail at the end of the menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(screen.getByRole('button', { name: 'menus.addCocktail' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Mojito')).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Spritz' }));

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledTimes(1));
    expect(sentCocktailIds()).toEqual([1, 2, 3]);
    expect(screen.getByText('Spritz')).toBeInTheDocument();
  });

  it('removes a cocktail and hides another', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.removeItem' }));
    await waitFor(() => expect(screen.queryByText('Mojito')).not.toBeInTheDocument());
    await user.click(within(rowOf('Negroni')).getByRole('button', { name: 'menus.hideItem' }));

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledTimes(2));
    expect(sentCocktails(0)).toEqual([{ cocktailId: 2, position: 0, isHidden: false, menuSectionId: null }]);
    expect(sentCocktails(1)).toEqual([{ cocktailId: 2, position: 0, isHidden: true, menuSectionId: null }]);
  });

  it('moves a cocktail down inside its section', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.moveDown' }));

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledTimes(1));
    expect(sentCocktailIds()).toEqual([2, 1]);
    expect(within(rowOf('Negroni')).getByRole('button', { name: 'menus.moveUp' })).toBeDisabled();
  });

  it('puts the cocktail back and shows the server error when the save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(menusApi.update).mockRejectedValue(new ApiError(400, 'Unknown section'));
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.removeItem' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unknown section'));
    expect(screen.getByText('Mojito')).toBeInTheDocument();
  });

  it('saves the menu info with its button only', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByDisplayValue('Summer');

    await user.clear(name);
    await user.type(name, 'Winter');
    const slug = screen.getByDisplayValue('summer');
    await user.clear(slug);
    await user.type(slug, 'Winter Menu');
    await user.type(screen.getByRole('textbox', { name: 'menus.description' }), 'Hot drinks');
    await user.click(screen.getByRole('switch', { name: 'menus.isPublic' }));
    expect(menusApi.update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledWith(3, {
      name: 'Winter', slug: 'winter-menu', description: 'Hot drinks', isPublic: true,
    }));
  });

  it('links to the public page of a published menu', async () => {
    storedMenu = { ...storedMenu, isPublic: true };
    renderPage();

    expect(await screen.findByRole('link', { name: '/menu/summer' })).toHaveAttribute('href', '/menu/summer');
  });

  it('shows an error with a way back when the menu does not exist', async () => {
    vi.mocked(menusApi.get).mockRejectedValue(new ApiError(404, 'Resource not found'));
    renderPage();

    expect(await screen.findByText('menus.loadError')).toBeInTheDocument();
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /menus.backToList/ })).toBeInTheDocument();
  });

  it('shows an empty menu', async () => {
    storedMenu = makeMenu([], []);
    renderPage();

    expect(await screen.findByText('menus.noCocktails')).toBeInTheDocument();
    expect(screen.getByText('menus.sections.empty.cocktails')).toBeInTheDocument();
  });
});
