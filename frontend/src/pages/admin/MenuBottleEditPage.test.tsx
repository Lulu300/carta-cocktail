import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import MenuBottleEditPage from './MenuBottleEditPage';
import type { Bottle, Menu, MenuBottle, MenuSection } from '../../types';
import type { MenuBottleExclusion } from '../../services/api';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    menus: { get: vi.fn(), update: vi.fn() },
    menuBottles: {
      sync: vi.fn(), update: vi.fn(), reorder: vi.fn(), exclusions: vi.fn(), exclude: vi.fn(), restore: vi.fn(),
    },
    menuSections: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  };
});

import {
  ApiError,
  menus as menusApi,
  menuBottles as menuBottlesApi,
  menuSections as menuSectionsApi,
} from '../../services/api';

function makeBottle(id: number, name: string, overrides: Partial<Bottle> = {}): Bottle {
  return {
    id,
    name,
    categoryId: 1,
    category: { id: 1, name: 'Gin', type: 'SPIRIT', desiredStock: 1, minimumPercent: 0, createdAt: '2026-01-01' },
    purchasePrice: null,
    capacityMl: 700,
    remainingPercent: 100,
    openedAt: null,
    alcoholPercentage: null,
    location: null,
    isApero: true,
    isDigestif: false,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

const gins: MenuSection = { id: 4, menuId: 5, name: 'Gins', position: 0 };
const hendricks = makeBottle(1, 'Hendricks', { alcoholPercentage: 41.4 });
const sameHendricks = makeBottle(2, 'Hendricks', { alcoholPercentage: 41.4 });
const lillet = makeBottle(3, 'Lillet');
const campari = makeBottle(6, 'Campari');

function makeEntry(id: number, bottle: Bottle, menuSectionId: number | null = null): MenuBottle {
  return { id, menuId: 5, bottleId: bottle.id, bottle, menuSectionId, position: id, isHidden: false };
}

/** What the server stores: a refetch after a change returns the saved state. */
let stored: { menu: Menu; exclusions: MenuBottleExclusion[] };

function storedEntries(): MenuBottle[] {
  return stored.menu.bottles ?? [];
}

function setEntries(entries: MenuBottle[]) {
  stored.menu = { ...stored.menu, bottles: entries.map((entry, position) => ({ ...entry, position })) };
}

function storeMenu(overrides: Partial<Menu> = {}, exclusions: MenuBottleExclusion[] = []) {
  stored = {
    menu: {
      id: 5,
      name: 'Apéritifs',
      description: 'Before dinner',
      slug: 'aperitifs',
      type: 'APEROS',
      isPublic: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      sections: [],
      bottles: [makeEntry(10, hendricks), makeEntry(11, sameHendricks), makeEntry(12, lillet)],
      ...overrides,
    },
    exclusions,
  };
}

function updateEntry(id: number, changes: Partial<MenuBottle>) {
  setEntries(storedEntries().map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
}

function renderPage() {
  window.history.pushState({}, '', '/admin/menus/5/bottles');
  return renderWithFeedback(
    <Routes>
      <Route path="/admin/menus/:id/bottles" element={<MenuBottleEditPage />} />
    </Routes>,
  );
}

function rowOf(name: string, container: HTMLElement = document.body): HTMLElement {
  const row = within(container).getByText(name).closest('li');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

function compositionCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'menus.bottles.title' }).closest('section') as HTMLElement;
}

function excludedCard(): HTMLElement {
  return screen.getByText(/menus.bottles.excludedTitle/).closest('section') as HTMLElement;
}

function compositionNames(): string[] {
  return within(compositionCard()).getAllByRole('listitem').map((row) => row.querySelector('.font-medium')?.textContent ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  storeMenu();
  vi.mocked(menusApi.get).mockImplementation(async () => stored.menu);
  vi.mocked(menusApi.update).mockImplementation(async (_id, data) => {
    stored.menu = { ...stored.menu, ...data } as Menu;
    return stored.menu;
  });
  vi.mocked(menuBottlesApi.update).mockImplementation(async (id, changes) => {
    updateEntry(id, changes);
    return storedEntries().find((entry) => entry.id === id) as MenuBottle;
  });
  vi.mocked(menuBottlesApi.reorder).mockImplementation(async (_menuId, ids) => {
    setEntries(ids.map((id) => storedEntries().find((entry) => entry.id === id) as MenuBottle));
    return { message: 'ok' };
  });
  vi.mocked(menuBottlesApi.exclusions).mockImplementation(async () => stored.exclusions);
  vi.mocked(menuBottlesApi.exclude).mockImplementation(async (_menuId, bottleIds) => {
    const removed = storedEntries().filter((entry) => bottleIds.includes(entry.bottleId));
    setEntries(storedEntries().filter((entry) => !bottleIds.includes(entry.bottleId)));
    stored.exclusions = [
      ...stored.exclusions,
      ...removed.map((entry) => ({ menuId: 5, bottleId: entry.bottleId, bottle: entry.bottle as Bottle, createdAt: '2026-10-12' })),
    ];
    return { message: 'ok' };
  });
  vi.mocked(menuBottlesApi.restore).mockImplementation(async (_menuId, bottleId) => {
    const exclusion = stored.exclusions.find((item) => item.bottleId === bottleId) as MenuBottleExclusion;
    stored.exclusions = stored.exclusions.filter((item) => item.bottleId !== bottleId);
    setEntries([...storedEntries(), makeEntry(50 + bottleId, exclusion.bottle)]);
    return { message: 'ok' };
  });
  vi.mocked(menuBottlesApi.sync).mockResolvedValue({ message: 'ok', added: 0, removed: 0 });
  vi.mocked(menuSectionsApi.delete).mockImplementation(async (id) => {
    stored.menu = { ...stored.menu, sections: (stored.menu.sections ?? []).filter((section) => section.id !== id) };
    setEntries(storedEntries().map((entry) => (entry.menuSectionId === id ? { ...entry, menuSectionId: null } : entry)));
    return { message: 'ok' };
  });
});

afterEach(clearToasts);

describe('MenuBottleEditPage', () => {
  it('groups identical bottles under a title that follows the menu type', async () => {
    renderPage();

    expect(await screen.findByText('Hendricks')).toBeInTheDocument();
    expect(menusApi.get).toHaveBeenCalledWith(5);
    expect(screen.getByRole('heading', { name: 'menus.bottles.aperos.title' })).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText('menus.bottles.count')).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText('menus.bottles.abv')).toBeInTheDocument();
    expect(within(rowOf('Lillet')).queryByText('menus.bottles.abv')).not.toBeInTheDocument();
  });

  it('marks a bottle at 0 % as empty', async () => {
    storeMenu({ bottles: [makeEntry(12, makeBottle(3, 'Lillet', { remainingPercent: 0 }))] });
    renderPage();

    expect(await screen.findByText('Lillet')).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByText('menus.bottles.empty')).toBeInTheDocument();
  });

  it('keeps both groups hidden after two quick visibility changes', async () => {
    const user = userEvent.setup();
    const answers: (() => void)[] = [];
    vi.mocked(menuBottlesApi.update).mockImplementation((id, changes) => new Promise((resolve) => {
      answers.push(() => {
        updateEntry(id, changes);
        resolve({} as MenuBottle);
      });
    }));
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.hideItem' }));
    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.hideItem' }));

    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    // The second change waits for the first one: only the two Hendricks bottles are sent.
    expect(menuBottlesApi.update).toHaveBeenCalledTimes(2);
    answers[1]();
    answers[0]();
    await waitFor(() => expect(menuBottlesApi.update).toHaveBeenCalledTimes(3));
    // No refetch between the two changes: it would show Lillet visible again.
    expect(menusApi.get).toHaveBeenCalledTimes(1);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    answers[2]();

    await waitFor(() => expect(menusApi.get).toHaveBeenCalledTimes(2));
    expect(storedEntries().every((entry) => entry.isHidden)).toBe(true);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
  });

  it('moves a group with one request that lists every entry in the new order', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.moveUp' }));

    await waitFor(() => expect(menuBottlesApi.reorder).toHaveBeenCalledTimes(1));
    expect(menuBottlesApi.reorder).toHaveBeenCalledWith(5, [12, 10, 11]);
    expect(menuBottlesApi.update).not.toHaveBeenCalled();
    expect(compositionNames()).toEqual(['Lillet', 'Hendricks']);
  });

  it('moves a group to a section with one request per bottle of the group', async () => {
    const user = userEvent.setup();
    storeMenu({ sections: [gins] });
    renderPage();
    await screen.findByText('Hendricks');

    await user.selectOptions(within(rowOf('Hendricks')).getByRole('combobox', { name: 'menus.sections.select' }), '4');

    await waitFor(() => expect(menuBottlesApi.update).toHaveBeenCalledTimes(2));
    expect(menuBottlesApi.update).toHaveBeenCalledWith(10, { menuSectionId: 4 });
    expect(menuBottlesApi.update).toHaveBeenCalledWith(11, { menuSectionId: 4 });
  });

  it('deletes a section with a single request', async () => {
    const user = userEvent.setup();
    storeMenu({ sections: [gins], bottles: [makeEntry(10, hendricks, 4), makeEntry(12, lillet)] });
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: 'menus.sections.delete' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('menus.sections.confirmDelete.bottles');
    await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(menuSectionsApi.delete).toHaveBeenCalledWith(4));
    expect(menuSectionsApi.delete).toHaveBeenCalledTimes(1);
    expect(menuBottlesApi.update).not.toHaveBeenCalled();
    expect(within(compositionCard()).queryByRole('heading', { name: 'Gins' })).not.toBeInTheDocument();
  });

  it('removes a group from a system menu in one request and lists it as removed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');
    await waitFor(() => expect(menuBottlesApi.exclusions).toHaveBeenCalledWith(5));
    expect(within(excludedCard()).getByText('menus.bottles.noExcluded')).toBeInTheDocument();

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.removeItem' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'menus.bottles.exclude' }));

    await waitFor(() => expect(menuBottlesApi.exclude).toHaveBeenCalledTimes(1));
    expect(menuBottlesApi.exclude).toHaveBeenCalledWith(5, [1, 2]);
    expect(within(compositionCard()).queryByText('Hendricks')).not.toBeInTheDocument();
    await waitFor(() => expect(within(excludedCard()).getAllByText('Hendricks')).toHaveLength(2));
  });

  it('keeps the group when the removal is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.removeItem' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(menuBottlesApi.exclude).not.toHaveBeenCalled();
    expect(within(compositionCard()).getByText('Hendricks')).toBeInTheDocument();
  });

  it('puts a removed bottle back at the end of the menu', async () => {
    const user = userEvent.setup();
    storeMenu({}, [{ menuId: 5, bottleId: 6, bottle: campari, createdAt: '2026-10-12' }]);
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: 'menus.bottles.restoreLabel' }));

    await waitFor(() => expect(compositionNames()).toEqual(['Hendricks', 'Lillet', 'Campari']));
    expect(menuBottlesApi.restore).toHaveBeenCalledWith(5, 6);
    expect(within(excludedCard()).queryByText('Campari')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Campari', compositionCard())).getByRole('button', { name: 'menus.moveUp' })).toBeEnabled());
  });

  it('shows the removed bottle again with a toast when putting it back fails', async () => {
    const user = userEvent.setup();
    storeMenu({}, [{ menuId: 5, bottleId: 6, bottle: campari, createdAt: '2026-10-12' }]);
    vi.mocked(menuBottlesApi.restore).mockRejectedValue(new ApiError(404, 'Resource not found'));
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: 'menus.bottles.restoreLabel' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    expect(within(excludedCard()).getByText('Campari')).toBeInTheDocument();
    expect(within(compositionCard()).queryByText('Campari')).not.toBeInTheDocument();
  });

  it('renames a system menu but keeps its slug read-only', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByDisplayValue('Apéritifs');
    expect(name).toBeEnabled();
    expect(screen.getByDisplayValue('aperitifs')).toHaveAttribute('readonly');
    expect(screen.getByText('menus.slugLocked')).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'Apéros');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(menusApi.update).toHaveBeenCalledWith(5, {
      name: 'Apéros', description: 'Before dinner', isPublic: true,
    }));
  });

  it('reloads the menu after a sync', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: 'menus.bottles.sync' }));

    await waitFor(() => expect(menuBottlesApi.sync).toHaveBeenCalledWith(5));
    await waitFor(() => expect(menusApi.get).toHaveBeenCalledTimes(2));
  });

  it('offers neither removal nor removed bottles on a personal menu', async () => {
    storeMenu({ slug: 'summer-aperos', name: 'Summer' });
    renderPage();
    await screen.findByText('Hendricks');

    expect(screen.queryByRole('button', { name: 'menus.removeItem' })).not.toBeInTheDocument();
    expect(screen.queryByText(/menus.bottles.excludedTitle/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('summer-aperos')).not.toHaveAttribute('readonly');
    expect(menuBottlesApi.exclusions).not.toHaveBeenCalled();
  });

  it('titles a digestifs menu as such and shows its empty state', async () => {
    storeMenu({ type: 'DIGESTIFS', slug: 'digestifs', bottles: [] });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'menus.bottles.digestifs.title' })).toBeInTheDocument();
    expect(screen.getByText('menus.bottles.digestifs.empty')).toBeInTheDocument();
  });

  it('shows an error when the menu does not exist', async () => {
    vi.mocked(menusApi.get).mockRejectedValue(new ApiError(404, 'Resource not found'));
    renderPage();

    expect(await screen.findByText('menus.loadError')).toBeInTheDocument();
  });
});
