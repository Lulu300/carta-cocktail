import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildCocktail, buildMenu, buildMenuCocktail, buildMenuSection } from '../../test/factories';
import { server } from '../../test/msw/server';
import { mockApiResponse } from '../../test/msw/utils';
import MenuEditPage from './MenuEditPage';
import type { Cocktail, Menu, MenuCocktail, MenuInput, MenuSection } from '../../types';

const classics = buildMenuSection({ id: 7, menuId: 3, name: 'Classics', position: 0 });

function makeEntry(cocktail: Cocktail, position: number, menuSectionId: number | null = null): MenuCocktail {
  return buildMenuCocktail({ id: 100 + cocktail.id, menuId: 3, cocktail, menuSectionId, position });
}

const mojito = buildCocktail({ id: 1, name: 'Mojito' });
const negroni = buildCocktail({ id: 2, name: 'Negroni' });
const spritz = buildCocktail({ id: 3, name: 'Spritz' });

function makeMenu(cocktails: MenuCocktail[], sections: MenuSection[] = [classics]): Menu {
  return buildMenu({ id: 3, name: 'Summer', slug: 'summer', isPublic: false, sections, cocktails });
}

const ALL_COCKTAILS = [mojito, negroni, spritz];

// --- Fake backend of the editor: it stores the menu and records each request ---

/** What the server stores: a refetch after a save returns the saved composition. */
let storedMenu: Menu;

/** Requests received, in order: the id of each menu read and the body of each update. */
let received: { menuReads: number[]; updates: Partial<MenuInput>[] };

/** How the server answers an update; the default stores it. A test replaces it to refuse or hold one. */
let answerUpdate: (data: Partial<MenuInput>) => Promise<Response>;

/** How the server answers a read of the menu. */
let answerRead: () => Promise<Response>;

function storeCocktails(items: NonNullable<Partial<MenuInput>['cocktails']>) {
  storedMenu = {
    ...storedMenu,
    cocktails: items.flatMap((item, index) => ALL_COCKTAILS
      .filter((cocktail) => cocktail.id === item.cocktailId)
      .map((cocktail) => ({ ...makeEntry(cocktail, index, item.menuSectionId ?? null), isHidden: item.isHidden ?? false }))),
  };
}

function storeUpdate(data: Partial<MenuInput>): Response {
  if (data.cocktails) storeCocktails(data.cocktails);
  return HttpResponse.json(storedMenu);
}

/** The menu fields the editor sends. */
function isMenuUpdate(body: unknown): body is Partial<MenuInput> {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}

function installFakeBackend() {
  received = { menuReads: [], updates: [] };
  answerRead = async () => HttpResponse.json(storedMenu);
  answerUpdate = async (data) => storeUpdate(data);
  server.use(
    http.get('/api/menus/:id', ({ params }) => {
      received.menuReads.push(Number(params.id));
      return answerRead();
    }),
    http.put('/api/menus/:id', async ({ request }) => {
      const body: unknown = await request.json();
      if (!isMenuUpdate(body)) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 });
      received.updates.push(body);
      return answerUpdate(body);
    }),
  );
}

/** The first load answers; every refetch then waits forever, so only the editor itself can fix the screen. */
function serveOnlyFirstLoad() {
  answerRead = async () => (received.menuReads.length === 1 ? HttpResponse.json(storedMenu) : new Promise<Response>(() => {}));
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
  return received.updates[call].cocktails ?? [];
}

function sentCocktailIds(call = 0) {
  return sentCocktails(call).map((item) => item.cocktailId);
}

beforeEach(() => {
  storedMenu = makeMenu([makeEntry(mojito, 0), makeEntry(negroni, 1)]);
  installFakeBackend();
  mockApiResponse('get', '/api/cocktails', ALL_COCKTAILS);
});

afterEach(clearToasts);

describe('MenuEditPage', () => {
  it('shows the menu info and its cocktails', async () => {
    renderPage();

    expect(await screen.findByText('Mojito')).toBeInTheDocument();
    expect(received.menuReads).toEqual([3]);
    expect(screen.getByDisplayValue('Summer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('summer')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('link', { name: /menus.backToList/ })).toHaveAttribute('href', '/admin/menus');
  });

  it('saves the section of a cocktail at once, with every cocktail of the menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.selectOptions(within(rowOf('Negroni')).getByRole('combobox', { name: 'menus.sections.select' }), '7');

    await waitFor(() => expect(received.updates).toHaveLength(1));
    expect(sentCocktails()).toEqual([
      { cocktailId: 1, position: 0, isHidden: false, menuSectionId: null },
      { cocktailId: 2, position: 1, isHidden: false, menuSectionId: 7 },
    ]);
    const classicsSection = screen.getByText('Classics', { selector: 'h3' }).closest('section');
    if (!classicsSection) throw new Error('No Classics section');
    expect(within(classicsSection).getByText('Negroni')).toBeInTheDocument();
  });

  it('adds a cocktail at the end of the menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(screen.getByRole('button', { name: 'menus.addCocktail' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Mojito')).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Spritz' }));

    await waitFor(() => expect(received.updates).toHaveLength(1));
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

    await waitFor(() => expect(received.updates).toHaveLength(2));
    expect(sentCocktails(0)).toEqual([{ cocktailId: 2, position: 0, isHidden: false, menuSectionId: null }]);
    expect(sentCocktails(1)).toEqual([{ cocktailId: 2, position: 0, isHidden: true, menuSectionId: null }]);
  });

  it('moves a cocktail down inside its section', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.moveDown' }));

    await waitFor(() => expect(received.updates).toHaveLength(1));
    expect(sentCocktailIds()).toEqual([2, 1]);
    expect(within(rowOf('Negroni')).getByRole('button', { name: 'menus.moveUp' })).toBeDisabled();
  });

  it('puts the cocktail back and shows the server error when the save fails', async () => {
    const user = userEvent.setup();
    answerUpdate = async () => HttpResponse.json({ error: 'Unknown section' }, { status: 400 });
    serveOnlyFirstLoad();
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.removeItem' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unknown section'));
    // The refetch never answers: the editor put the cocktail back by itself.
    expect(screen.getByText('Mojito')).toBeInTheDocument();
  });

  it('sends each change on top of the saved list: never a refused change, never a later one', async () => {
    const user = userEvent.setup();
    storedMenu = makeMenu([makeEntry(mojito, 0), makeEntry(negroni, 1), makeEntry(spritz, 2)]);
    const answers: { resolve: () => void; reject: (message: string) => void }[] = [];
    answerUpdate = (data) => new Promise((resolve) => {
      answers.push({
        resolve: () => resolve(storeUpdate(data)),
        reject: (message) => resolve(HttpResponse.json({ error: message }, { status: 500 })),
      });
    });
    const hiddenFlags = (call: number) => sentCocktails(call).map((item) => item.isHidden);
    renderPage();
    await screen.findByText('Mojito');

    await user.click(within(rowOf('Mojito')).getByRole('button', { name: 'menus.hideItem' }));
    await user.click(within(rowOf('Negroni')).getByRole('button', { name: 'menus.hideItem' }));
    await user.click(within(rowOf('Spritz')).getByRole('button', { name: 'menus.hideItem' }));
    expect(within(rowOf('Mojito')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    await waitFor(() => expect(received.updates).toHaveLength(1));

    answers[0].reject('Boom');
    await waitFor(() => expect(received.updates).toHaveLength(2));
    // Without the refused Mojito change, and without the Spritz change still waiting.
    expect(hiddenFlags(1)).toEqual([false, true, false]);
    // The screen drops the refused change and keeps the ones still waiting.
    expect(within(rowOf('Mojito')).getByRole('button', { name: 'menus.hideItem' })).toBeInTheDocument();
    expect(within(rowOf('Negroni')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Spritz')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');

    answers[1].resolve();
    await waitFor(() => expect(received.updates).toHaveLength(3));
    expect(hiddenFlags(2)).toEqual([false, true, true]);
    answers[2].resolve();

    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(storedMenu.cocktails?.map((item) => item.isHidden)).toEqual([false, true, true]);
    expect(within(rowOf('Mojito')).getByRole('button', { name: 'menus.hideItem' })).toBeInTheDocument();
    expect(within(rowOf('Negroni')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Spritz')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
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
    expect(received.updates).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(received.updates).toEqual([{
      name: 'Winter', slug: 'winter-menu', description: 'Hot drinks', isPublic: true,
    }]));
  });

  it('saves the menu info once on a double click', async () => {
    renderPage();
    await screen.findByDisplayValue('Summer');
    const save = screen.getByRole('button', { name: 'common.save' });

    // Two clicks before React re-renders: the button is not disabled yet.
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('menus.updated'));
    expect(received.updates).toHaveLength(1);
  });

  it('links to the public page of a published menu', async () => {
    storedMenu = { ...storedMenu, isPublic: true };
    renderPage();

    expect(await screen.findByRole('link', { name: '/menu/summer' })).toHaveAttribute('href', '/menu/summer');
  });

  it('shows an error with a way back when the menu does not exist', async () => {
    answerRead = async () => HttpResponse.json({ error: 'Resource not found' }, { status: 404 });
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
