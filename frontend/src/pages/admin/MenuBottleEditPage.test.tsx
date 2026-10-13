import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildBottle, buildCategory, buildMenu, buildMenuBottle, buildMenuSection } from '../../test/factories';
import { server } from '../../test/msw/server';
import MenuBottleEditPage from './MenuBottleEditPage';
import type { Bottle, Menu, MenuBottle } from '../../types';
import type { MenuBottleExclusion } from '../../services/api';

const gin = buildCategory({ id: 1, name: 'Gin', minimumPercent: 0 });

function makeBottle(id: number, name: string, overrides: Partial<Bottle> = {}): Bottle {
  return buildBottle({ id, name, category: gin, purchasePrice: null, alcoholPercentage: null, isApero: true, ...overrides });
}

const gins = buildMenuSection({ id: 4, menuId: 5, name: 'Gins', position: 0 });
const hendricks = makeBottle(1, 'Hendricks', { alcoholPercentage: 41.4 });
const sameHendricks = makeBottle(2, 'Hendricks', { alcoholPercentage: 41.4 });
const lillet = makeBottle(3, 'Lillet');
const campari = makeBottle(6, 'Campari');
const sameCampari = makeBottle(7, 'Campari');

function exclusionOf(bottle: Bottle): MenuBottleExclusion {
  return { menuId: 5, bottleId: bottle.id, bottle, createdAt: '2026-10-12' };
}

function removedCamparis(): MenuBottleExclusion[] {
  return [campari, sameCampari].map(exclusionOf);
}

function makeEntry(id: number, bottle: Bottle, menuSectionId: number | null = null): MenuBottle {
  return buildMenuBottle({ id, menuId: 5, bottle, menuSectionId, position: id });
}

// --- Fake backend of the editor: it stores the menu and records each request ---

/** What the server stores: a refetch after a change returns the saved state. */
let stored: { menu: Menu; exclusions: MenuBottleExclusion[] };

/** Requests received, in order. */
let received: {
  menuReads: number[];
  exclusionReads: number[];
  menuUpdates: unknown[];
  entryUpdates: { id: number; changes: Partial<MenuBottle> }[];
  reorders: number[][];
  excludes: number[][];
  restores: number[];
  syncs: number[];
  sectionDeletes: number[];
};

/** How the server answers the requests a test needs to control; the defaults apply the change. */
let answer: {
  menuRead: () => Promise<Response>;
  exclusionsRead: () => Promise<Response>;
  entryUpdate: (id: number, changes: Partial<MenuBottle>) => Promise<Response>;
  exclude: (bottleIds: number[]) => Promise<Response>;
  restore: (bottleId: number) => Promise<Response>;
  sync: () => Promise<Response>;
};

const ok = () => HttpResponse.json({ message: 'ok' });
const refused = (status: number, error: string) => HttpResponse.json({ error }, { status });
const never = () => new Promise<Response>(() => {});

function storedEntries(): MenuBottle[] {
  return stored.menu.bottles ?? [];
}

function setEntries(entries: MenuBottle[]) {
  stored.menu = { ...stored.menu, bottles: entries.map((entry, position) => ({ ...entry, position })) };
}

function storeMenu(overrides: Partial<Menu> = {}, exclusions: MenuBottleExclusion[] = []) {
  stored = {
    menu: buildMenu({
      id: 5,
      name: 'Apéritifs',
      description: 'Before dinner',
      slug: 'aperitifs',
      type: 'APEROS',
      bottles: [makeEntry(10, hendricks), makeEntry(11, sameHendricks), makeEntry(12, lillet)],
      ...overrides,
    }),
    exclusions,
  };
}

function updateEntry(id: number, changes: Partial<MenuBottle>) {
  setEntries(storedEntries().map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
}

function excludeBottles(bottleIds: number[]) {
  const removed = storedEntries().filter((entry) => bottleIds.includes(entry.bottleId));
  setEntries(storedEntries().filter((entry) => !bottleIds.includes(entry.bottleId)));
  stored.exclusions = [
    ...stored.exclusions,
    ...removed.flatMap((entry) => (entry.bottle ? [exclusionOf(entry.bottle)] : [])),
  ];
}

function restoreBottle(bottleId: number) {
  const exclusion = stored.exclusions.find((item) => item.bottleId === bottleId);
  if (!exclusion) throw new Error(`Bottle ${bottleId} is not removed`);
  stored.exclusions = stored.exclusions.filter((item) => item.bottleId !== bottleId);
  setEntries([...storedEntries(), makeEntry(50 + bottleId, exclusion.bottle)]);
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  return typeof body === 'object' && body !== null ? { ...body } : {};
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

/** The entry changes the editor may send: visibility, section, position. */
function entryChanges(body: Record<string, unknown>): Partial<MenuBottle> {
  const changes: Partial<MenuBottle> = {};
  if (typeof body.isHidden === 'boolean') changes.isHidden = body.isHidden;
  if (typeof body.menuSectionId === 'number' || body.menuSectionId === null) changes.menuSectionId = body.menuSectionId;
  if (typeof body.position === 'number') changes.position = body.position;
  return changes;
}

function installFakeBackend() {
  received = {
    menuReads: [], exclusionReads: [], menuUpdates: [], entryUpdates: [], reorders: [], excludes: [], restores: [],
    syncs: [], sectionDeletes: [],
  };
  answer = {
    menuRead: async () => HttpResponse.json(stored.menu),
    exclusionsRead: async () => HttpResponse.json(stored.exclusions),
    entryUpdate: async (id, changes) => {
      updateEntry(id, changes);
      return HttpResponse.json(storedEntries().find((entry) => entry.id === id) ?? null);
    },
    exclude: async (bottleIds) => {
      excludeBottles(bottleIds);
      return ok();
    },
    restore: async (bottleId) => {
      restoreBottle(bottleId);
      return ok();
    },
    sync: async () => HttpResponse.json({ message: 'ok', added: 0, removed: 0 }),
  };
  server.use(
    http.get('/api/menus/:id', ({ params }) => {
      received.menuReads.push(Number(params.id));
      return answer.menuRead();
    }),
    http.put('/api/menus/:id', async ({ request }) => {
      const data = await readObject(request);
      received.menuUpdates.push(data);
      stored.menu = { ...stored.menu, ...data };
      return HttpResponse.json(stored.menu);
    }),
    http.put('/api/menu-bottles/:id', async ({ request, params }) => {
      const changes = entryChanges(await readObject(request));
      received.entryUpdates.push({ id: Number(params.id), changes });
      return answer.entryUpdate(Number(params.id), changes);
    }),
    http.post('/api/menu-bottles/menu/:menuId/reorder', async ({ request }) => {
      const ids = numbers((await readObject(request)).ids);
      received.reorders.push(ids);
      setEntries(ids.flatMap((id) => storedEntries().filter((entry) => entry.id === id)));
      return ok();
    }),
    http.get('/api/menu-bottles/menu/:menuId/exclusions', ({ params }) => {
      received.exclusionReads.push(Number(params.menuId));
      return answer.exclusionsRead();
    }),
    http.post('/api/menu-bottles/menu/:menuId/exclusions', async ({ request }) => {
      const bottleIds = numbers((await readObject(request)).bottleIds);
      received.excludes.push(bottleIds);
      return answer.exclude(bottleIds);
    }),
    http.delete('/api/menu-bottles/menu/:menuId/exclusions/:bottleId', ({ params }) => {
      received.restores.push(Number(params.bottleId));
      return answer.restore(Number(params.bottleId));
    }),
    http.post('/api/menu-bottles/menu/:menuId/sync', ({ params }) => {
      received.syncs.push(Number(params.menuId));
      return answer.sync();
    }),
    http.delete('/api/menu-sections/sections/:id', ({ params }) => {
      const id = Number(params.id);
      received.sectionDeletes.push(id);
      stored.menu = { ...stored.menu, sections: (stored.menu.sections ?? []).filter((section) => section.id !== id) };
      setEntries(storedEntries().map((entry) => (entry.menuSectionId === id ? { ...entry, menuSectionId: null } : entry)));
      return ok();
    }),
  );
}

/** The first loads answer; every refetch then waits forever, so only the editor itself can fix the screen. */
function serveOnlyFirstLoad() {
  answer.menuRead = async () => (received.menuReads.length === 1 ? HttpResponse.json(stored.menu) : never());
  answer.exclusionsRead = async () => (received.exclusionReads.length === 1 ? HttpResponse.json(stored.exclusions) : never());
}

/** Holds every entry update until the test answers it, in any order. */
function holdEntryUpdates(): (() => void)[] {
  const pending: (() => void)[] = [];
  answer.entryUpdate = (id, changes) => new Promise((resolve) => {
    pending.push(() => {
      updateEntry(id, changes);
      resolve(HttpResponse.json(storedEntries().find((entry) => entry.id === id) ?? null));
    });
  });
  return pending;
}

// --- Page helpers ---

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

function sectionAround(element: HTMLElement): HTMLElement {
  const section = element.closest('section');
  if (!section) throw new Error('No section around the element');
  return section;
}

function compositionCard(): HTMLElement {
  return sectionAround(screen.getByRole('heading', { name: 'menus.bottles.title' }));
}

function excludedCard(): HTMLElement {
  return sectionAround(screen.getByText(/menus.bottles.excludedTitle/));
}

function compositionNames(): string[] {
  return within(compositionCard()).getAllByRole('listitem').map((row) => row.querySelector('.font-medium')?.textContent ?? '');
}

async function removeGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: 'menus.removeItem' }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'menus.bottles.exclude' }));
}

beforeEach(() => {
  storeMenu();
  installFakeBackend();
});

afterEach(clearToasts);

describe('MenuBottleEditPage', () => {
  it('groups identical bottles under a title that follows the menu type', async () => {
    renderPage();

    expect(await screen.findByText('Hendricks')).toBeInTheDocument();
    expect(received.menuReads).toEqual([5]);
    expect(screen.getByRole('heading', { name: 'menus.bottles.aperos.title' })).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText('menus.bottles.count')).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText('units.abv')).toBeInTheDocument();
    expect(within(rowOf('Lillet')).queryByText('units.abv')).not.toBeInTheDocument();
  });

  it('marks a bottle at 0 % as empty', async () => {
    storeMenu({ bottles: [makeEntry(12, makeBottle(3, 'Lillet', { remainingPercent: 0 }))] });
    renderPage();

    expect(await screen.findByText('Lillet')).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByText('menus.bottles.empty')).toBeInTheDocument();
  });

  it('keeps both groups hidden after two quick visibility changes', async () => {
    const user = userEvent.setup();
    const answers = holdEntryUpdates();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.hideItem' }));
    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.hideItem' }));

    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    // The second change waits for the first one: only the two Hendricks bottles are sent.
    await waitFor(() => expect(received.entryUpdates).toHaveLength(2));
    answers[1]();
    answers[0]();
    await waitFor(() => expect(received.entryUpdates).toHaveLength(3));
    // No refetch between the two changes: it would show Lillet visible again.
    expect(received.menuReads).toHaveLength(1);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    answers[2]();

    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(storedEntries().every((entry) => entry.isHidden)).toBe(true);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
  });

  it('moves a group with one request that lists every entry in the new order', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.moveUp' }));

    await waitFor(() => expect(received.reorders).toEqual([[12, 10, 11]]));
    expect(received.entryUpdates).toEqual([]);
    expect(compositionNames()).toEqual(['Lillet', 'Hendricks']);
  });

  it('moves a group to a section with one request per bottle of the group', async () => {
    const user = userEvent.setup();
    storeMenu({ sections: [gins] });
    renderPage();
    await screen.findByText('Hendricks');

    await user.selectOptions(within(rowOf('Hendricks')).getByRole('combobox', { name: 'menus.sections.select' }), '4');

    await waitFor(() => expect(received.entryUpdates).toHaveLength(2));
    expect(received.entryUpdates).toEqual(expect.arrayContaining([
      { id: 10, changes: { menuSectionId: 4 } },
      { id: 11, changes: { menuSectionId: 4 } },
    ]));
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

    await waitFor(() => expect(received.sectionDeletes).toEqual([4]));
    expect(received.entryUpdates).toEqual([]);
    expect(within(compositionCard()).queryByRole('heading', { name: 'Gins' })).not.toBeInTheDocument();
  });

  it('removes a group from a system menu in one request and lists it as removed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');
    await waitFor(() => expect(received.exclusionReads).toEqual([5]));
    await waitFor(() => expect(within(excludedCard()).getByText('menus.bottles.noExcluded')).toBeInTheDocument());

    await removeGroup(user, 'Hendricks');

    await waitFor(() => expect(received.excludes).toEqual([[1, 2]]));
    expect(within(compositionCard()).queryByText('Hendricks')).not.toBeInTheDocument();
    // One row for the two identical bottles, as in the menu.
    await waitFor(() => expect(within(excludedCard()).getAllByText('Hendricks')).toHaveLength(1));
    expect(within(rowOf('Hendricks', excludedCard())).getByText('menus.bottles.count')).toBeInTheDocument();
  });

  it('puts both lists back with a toast when the removal fails', async () => {
    const user = userEvent.setup();
    answer.exclude = async () => refused(400, 'Not a system menu');
    serveOnlyFirstLoad();
    renderPage();
    await screen.findByText('Hendricks');
    await waitFor(() => expect(within(excludedCard()).getByText('menus.bottles.noExcluded')).toBeInTheDocument());

    await removeGroup(user, 'Hendricks');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not a system menu'));
    // The refetches never answer: the editor put both lists back by itself.
    expect(within(compositionCard()).getByText('Hendricks')).toBeInTheDocument();
    expect(within(excludedCard()).queryByText('Hendricks')).not.toBeInTheDocument();
    expect(within(excludedCard()).getByText('menus.bottles.noExcluded')).toBeInTheDocument();
  });

  it('keeps the group when the removal is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: 'menus.removeItem' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(received.excludes).toEqual([]);
    expect(within(compositionCard()).getByText('Hendricks')).toBeInTheDocument();
  });

  it('puts a group of removed bottles back at the end of the menu, one request per bottle', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: 'menus.bottles.restoreLabel' }));

    await waitFor(() => expect(compositionNames()).toEqual(['Hendricks', 'Lillet', 'Campari']));
    expect(received.restores).toEqual(expect.arrayContaining([6, 7]));
    expect(received.restores).toHaveLength(2);
    expect(within(excludedCard()).queryByText('Campari')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Campari', compositionCard())).getByRole('button', { name: 'menus.moveUp' })).toBeEnabled());
    expect(within(rowOf('Campari', compositionCard())).getByText('menus.bottles.count')).toBeInTheDocument();
  });

  it('shows the removed bottles again with a toast when putting one back fails', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    answer.restore = async () => (received.restores.length === 1 ? ok() : refused(404, 'Resource not found'));
    serveOnlyFirstLoad();
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: 'menus.bottles.restoreLabel' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    // The refetches never answer: the editor put both lists back by itself.
    expect(within(excludedCard()).getByText('Campari')).toBeInTheDocument();
    expect(within(compositionCard()).queryByText('Campari')).not.toBeInTheDocument();
  });

  it('waits for every request of a group before the menu is read again', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    let finishSecond: () => void = () => {};
    answer.restore = (bottleId) => {
      if (received.restores.length === 1) return Promise.resolve(refused(404, 'Resource not found'));
      return new Promise((resolve) => {
        finishSecond = () => {
          restoreBottle(bottleId);
          resolve(ok());
        };
      });
    };
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: 'menus.bottles.restoreLabel' }));
    await waitFor(() => expect(received.restores).toHaveLength(2));
    // The first request failed, the second is still on its way: nothing is read again yet.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.menuReads).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toHaveTextContent('Resource not found');

    finishSecond();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    // As on the server: one Campari back in the menu, the other one still removed.
    await waitFor(() => expect(within(compositionCard()).getByText('Campari')).toBeInTheDocument());
    expect(within(excludedCard()).getByText('Campari')).toBeInTheDocument();
    expect(within(rowOf('Campari', excludedCard())).queryByText('menus.bottles.count')).not.toBeInTheDocument();
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

    await waitFor(() => expect(received.menuUpdates).toEqual([{
      name: 'Apéros', description: 'Before dinner', isPublic: true,
    }]));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('menus.updated'));
  });

  it('saves the menu info after the composition changes still waiting', async () => {
    const user = userEvent.setup();
    const answers = holdEntryUpdates();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.hideItem' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(received.entryUpdates).toHaveLength(1));
    expect(received.menuUpdates).toEqual([]);

    answers[0]();
    await waitFor(() => expect(received.menuUpdates).toHaveLength(1));
    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(within(rowOf('Lillet')).getByRole('button', { name: 'menus.showItem' })).toBeInTheDocument();
  });

  it('shows the bottles a sync added', async () => {
    const user = userEvent.setup();
    answer.sync = async () => {
      setEntries([...storedEntries(), makeEntry(60, campari)]);
      return HttpResponse.json({ message: 'ok', added: 1, removed: 0 });
    };
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: 'menus.bottles.sync' }));

    expect(await within(compositionCard()).findByText('Campari')).toBeInTheDocument();
    expect(received.syncs).toEqual([5]);
  });

  it('counts the bottles a sync added in the next move', async () => {
    const user = userEvent.setup();
    let finishSync: () => void = () => {};
    answer.sync = () => new Promise((resolve) => {
      finishSync = () => {
        setEntries([...storedEntries(), makeEntry(60, campari)]);
        resolve(HttpResponse.json({ message: 'ok', added: 1, removed: 0 }));
      };
    });
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: 'menus.bottles.sync' }));
    await user.click(within(rowOf('Lillet')).getByRole('button', { name: 'menus.moveUp' }));
    await waitFor(() => expect(received.syncs).toHaveLength(1));
    expect(received.reorders).toEqual([]);
    finishSync();

    // Campari, added by the sync, is not on screen when the move is clicked: it keeps its place last.
    await waitFor(() => expect(received.reorders).toEqual([[12, 10, 11, 60]]));
    await waitFor(() => expect(compositionNames()).toEqual(['Lillet', 'Hendricks', 'Campari']));
  });

  it('offers neither removal nor removed bottles on a personal menu', async () => {
    storeMenu({ slug: 'summer-aperos', name: 'Summer' });
    renderPage();
    await screen.findByText('Hendricks');

    expect(screen.queryByRole('button', { name: 'menus.removeItem' })).not.toBeInTheDocument();
    expect(screen.queryByText(/menus.bottles.excludedTitle/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('summer-aperos')).not.toHaveAttribute('readonly');
    expect(received.exclusionReads).toEqual([]);
  });

  it('titles a digestifs menu as such and shows its empty state', async () => {
    storeMenu({ type: 'DIGESTIFS', slug: 'digestifs', bottles: [] });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'menus.bottles.digestifs.title' })).toBeInTheDocument();
    expect(screen.getByText('menus.bottles.digestifs.empty')).toBeInTheDocument();
  });

  it('shows an error when the menu does not exist', async () => {
    answer.menuRead = async () => refused(404, 'Resource not found');
    renderPage();

    expect(await screen.findByText('menus.loadError')).toBeInTheDocument();
  });
});
