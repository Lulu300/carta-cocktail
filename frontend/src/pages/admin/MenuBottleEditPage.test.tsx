import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { buildBottle, buildCategory, buildMenu, buildMenuBottle, buildMenuSection } from '../../test/factories';
import { axe } from '../../test/axe';
import { server } from '../../test/msw/server';
import { errorResponse, pendingResponse, readJsonObject } from '../../test/msw/utils';
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
const emptyAperol = makeBottle(8, 'Aperol', { remainingPercent: 0 });
const chartreuse = makeBottle(9, 'Chartreuse', { isApero: false, isDigestif: true });
const notChecked = makeBottle(13, 'Vodka', { isApero: false });

/** Every bottle of the inventory, as `GET /api/bottles` returns them. */
const INVENTORY = [hendricks, sameHendricks, lillet, campari, sameCampari, emptyAperol, chartreuse, notChecked];

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
let stored: { menu: Menu; exclusions: MenuBottleExclusion[]; bottles: Bottle[] };

/** Requests received, in order. */
let received: {
  menuReads: number[];
  exclusionReads: number[];
  menuUpdates: unknown[];
  entryUpdates: { ids: number[]; changes: Partial<MenuBottle> }[];
  reorders: number[][];
  excludes: number[][];
  restores: number[][];
  adds: number[][];
  removes: number[][];
  syncs: number[];
  sectionDeletes: number[];
};

/** How the server answers the requests a test needs to control; the defaults apply the change. */
let answer: {
  menuRead: () => Promise<Response>;
  exclusionsRead: () => Promise<Response>;
  entryUpdate: (ids: number[], changes: Partial<MenuBottle>) => Promise<Response>;
  exclude: (bottleIds: number[]) => Promise<Response>;
  restore: (bottleIds: number[]) => Promise<Response>;
  add: (bottleIds: number[]) => Promise<Response>;
  remove: (entryIds: number[]) => Promise<Response>;
  sync: () => Promise<Response>;
};

const ok = () => HttpResponse.json({ message: 'ok' });

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
    bottles: INVENTORY,
  };
}

/** A personal menu of the given type, with Hendricks twice and Lillet unless told otherwise. */
function storePersonalMenu(overrides: Partial<Menu> = {}) {
  storeMenu({ slug: 'summer-aperos', name: 'Summer', ...overrides });
}

function updateEntries(ids: number[], changes: Partial<MenuBottle>) {
  setEntries(storedEntries().map((entry) => (ids.includes(entry.id) ? { ...entry, ...changes } : entry)));
}

function excludeBottles(bottleIds: number[]) {
  const removed = storedEntries().filter((entry) => bottleIds.includes(entry.bottleId));
  setEntries(storedEntries().filter((entry) => !bottleIds.includes(entry.bottleId)));
  stored.exclusions = [
    ...stored.exclusions,
    ...removed.flatMap((entry) => (entry.bottle ? [exclusionOf(entry.bottle)] : [])),
  ];
}

/** As the server: a bottle no longer checked as aperitif leaves the list without coming back in the menu. */
function restoreBottles(bottleIds: number[]) {
  const restored = bottleIds.flatMap((bottleId) => {
    const exclusion = stored.exclusions.find((item) => item.bottleId === bottleId);
    if (!exclusion) throw new Error(`Bottle ${bottleId} is not removed`);
    return exclusion.bottle.isApero ? [makeEntry(50 + bottleId, exclusion.bottle)] : [];
  });
  stored.exclusions = stored.exclusions.filter((item) => !bottleIds.includes(item.bottleId));
  setEntries([...storedEntries(), ...restored]);
}

function addBottles(bottleIds: number[]) {
  const added = bottleIds.map((bottleId) => {
    const bottle = stored.bottles.find((item) => item.id === bottleId);
    if (!bottle) throw new Error(`No bottle ${bottleId}`);
    return makeEntry(70 + bottleId, bottle);
  });
  setEntries([...storedEntries(), ...added]);
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

/** The change the editor may send for a group: visibility or section. */
function entryChanges(body: Record<string, unknown>): Partial<MenuBottle> {
  const changes: Partial<MenuBottle> = {};
  if (typeof body.isHidden === 'boolean') changes.isHidden = body.isHidden;
  if (typeof body.menuSectionId === 'number' || body.menuSectionId === null) changes.menuSectionId = body.menuSectionId;
  return changes;
}

function installFakeBackend() {
  received = {
    menuReads: [], exclusionReads: [], menuUpdates: [], entryUpdates: [], reorders: [], excludes: [], restores: [],
    adds: [], removes: [], syncs: [], sectionDeletes: [],
  };
  answer = {
    menuRead: async () => HttpResponse.json(stored.menu),
    exclusionsRead: async () => HttpResponse.json(stored.exclusions),
    entryUpdate: async (ids, changes) => {
      updateEntries(ids, changes);
      return ok();
    },
    exclude: async (bottleIds) => {
      excludeBottles(bottleIds);
      return ok();
    },
    restore: async (bottleIds) => {
      restoreBottles(bottleIds);
      return ok();
    },
    add: async (bottleIds) => {
      addBottles(bottleIds);
      return ok();
    },
    remove: async (entryIds) => {
      setEntries(storedEntries().filter((entry) => !entryIds.includes(entry.id)));
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
      const data = await readJsonObject(request);
      received.menuUpdates.push(data);
      stored.menu = { ...stored.menu, ...data };
      return HttpResponse.json(stored.menu);
    }),
    http.put('/api/menu-bottles/menu/:menuId/entries', async ({ request }) => {
      const body = await readJsonObject(request);
      const update = { ids: numbers(body.ids), changes: entryChanges(body) };
      received.entryUpdates.push(update);
      return answer.entryUpdate(update.ids, update.changes);
    }),
    http.post('/api/menu-bottles/menu/:menuId/entries', async ({ request }) => {
      const bottleIds = numbers((await readJsonObject(request)).bottleIds);
      received.adds.push(bottleIds);
      return answer.add(bottleIds);
    }),
    http.post('/api/menu-bottles/menu/:menuId/entries/remove', async ({ request }) => {
      const ids = numbers((await readJsonObject(request)).ids);
      received.removes.push(ids);
      return answer.remove(ids);
    }),
    http.get('/api/bottles', () => HttpResponse.json(stored.bottles)),
    http.post('/api/menu-bottles/menu/:menuId/reorder', async ({ request }) => {
      const ids = numbers((await readJsonObject(request)).ids);
      received.reorders.push(ids);
      setEntries(ids.flatMap((id) => storedEntries().filter((entry) => entry.id === id)));
      return ok();
    }),
    http.get('/api/menu-bottles/menu/:menuId/exclusions', ({ params }) => {
      received.exclusionReads.push(Number(params.menuId));
      return answer.exclusionsRead();
    }),
    http.post('/api/menu-bottles/menu/:menuId/exclusions', async ({ request }) => {
      const bottleIds = numbers((await readJsonObject(request)).bottleIds);
      received.excludes.push(bottleIds);
      return answer.exclude(bottleIds);
    }),
    http.post('/api/menu-bottles/menu/:menuId/exclusions/restore', async ({ request }) => {
      const bottleIds = numbers((await readJsonObject(request)).bottleIds);
      received.restores.push(bottleIds);
      return answer.restore(bottleIds);
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
  answer.menuRead = async () => (received.menuReads.length === 1 ? HttpResponse.json(stored.menu) : pendingResponse());
  answer.exclusionsRead = async () => (received.exclusionReads.length === 1 ? HttpResponse.json(stored.exclusions) : pendingResponse());
}

/** Holds every entry update until the test answers it. */
function holdEntryUpdates(): (() => void)[] {
  const pending: (() => void)[] = [];
  answer.entryUpdate = (ids, changes) => new Promise((resolve) => {
    pending.push(() => {
      updateEntries(ids, changes);
      resolve(ok());
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
      <Route path="/admin/menus/:id" element={<p>cocktail editor</p>} />
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
  return sectionAround(screen.getByRole('heading', { name: 'Bottles' }));
}

function excludedCard(): HTMLElement {
  return sectionAround(screen.getByText(/Removed bottles \(.+\)/));
}

function choicesCard(): HTMLElement {
  return sectionAround(screen.getByRole('heading', { name: 'Add bottles' }));
}

/** The list of bottles to add, once the menu has loaded. */
async function findChoicesCard(): Promise<HTMLElement> {
  return sectionAround(await screen.findByRole('heading', { name: 'Add bottles' }));
}

function choiceNames(): string[] {
  return within(choicesCard()).queryAllByRole('listitem').map((row) => row.querySelector('.font-medium')?.textContent ?? '');
}

async function addGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name, choicesCard())).getByRole('button', { name: /^Add .+ to the menu$/ }));
}

function compositionNames(): string[] {
  return within(compositionCard()).getAllByRole('listitem').map((row) => row.querySelector('.font-medium')?.textContent ?? '');
}

async function removeGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: /^Remove .+ from the menu$/ }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
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
    expect(screen.getByRole('heading', { name: 'Manage the aperitifs menu' })).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText(/^×.+$/)).toBeInTheDocument();
    expect(within(rowOf('Hendricks')).getByText(/^.+% vol\.$/)).toBeInTheDocument();
    expect(within(rowOf('Lillet')).queryByText(/^.+% vol\.$/)).not.toBeInTheDocument();
  });

  it('keeps a system menu automatic: sync, removed bottles, and no bottle to add by hand', async () => {
    const { container } = renderPage();
    await screen.findByText('Hendricks');

    expect(screen.getByText('Bottles checked as aperitif appear here automatically. Use "Synchronize" to update the list.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchronize' })).toBeInTheDocument();
    await waitFor(() => expect(within(excludedCard()).getByText('No bottle removed from this menu.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Add bottles' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('marks a bottle at 0 % as empty', async () => {
    storeMenu({ bottles: [makeEntry(12, makeBottle(3, 'Lillet', { remainingPercent: 0 }))] });
    renderPage();

    expect(await screen.findByText('Lillet')).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByText('Empty')).toBeInTheDocument();
  });

  it('keeps both groups hidden after two quick visibility changes', async () => {
    const user = userEvent.setup();
    const answers = holdEntryUpdates();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Hide .+$/ }));
    await user.click(within(rowOf('Lillet')).getByRole('button', { name: /^Hide .+$/ }));

    expect(within(rowOf('Hendricks')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
    // The second change waits for the first one: only the two Hendricks bottles are sent, together.
    await waitFor(() => expect(received.entryUpdates).toEqual([{ ids: [10, 11], changes: { isHidden: true } }]));
    answers[0]!();
    await waitFor(() => expect(received.entryUpdates).toHaveLength(2));
    expect(received.entryUpdates[1]).toEqual({ ids: [12], changes: { isHidden: true } });
    // No refetch between the two changes: it would show Lillet visible again.
    expect(received.menuReads).toHaveLength(1);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
    answers[1]!();

    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(storedEntries().every((entry) => entry.isHidden)).toBe(true);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
    expect(within(rowOf('Lillet')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
  });

  it('moves a group with one request that lists every entry in the new order', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Lillet')).getByRole('button', { name: /^Move .+ up$/ }));

    await waitFor(() => expect(received.reorders).toEqual([[12, 10, 11]]));
    expect(received.entryUpdates).toEqual([]);
    expect(compositionNames()).toEqual(['Lillet', 'Hendricks']);
  });

  it('moves a group to a section with one request for every bottle of the group', async () => {
    const user = userEvent.setup();
    storeMenu({ sections: [gins] });
    renderPage();
    await screen.findByText('Hendricks');

    await user.selectOptions(within(rowOf('Hendricks')).getByRole('combobox', { name: /^Section of .+$/ }), '4');

    await waitFor(() => expect(received.entryUpdates).toEqual([{ ids: [10, 11], changes: { menuSectionId: 4 } }]));
    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(storedEntries().map((entry) => entry.menuSectionId)).toEqual([4, 4, null]);
  });

  it('hides a large group of identical bottles with a single request', async () => {
    const user = userEvent.setup();
    const entries = Array.from({ length: 40 }, (_, index) => makeEntry(100 + index, makeBottle(100 + index, 'Hendricks')));
    storeMenu({ bottles: entries });
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Hide .+$/ }));

    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(received.entryUpdates).toEqual([{ ids: entries.map((entry) => entry.id), changes: { isHidden: true } }]);
    expect(within(rowOf('Hendricks')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
  });

  it('shows a group as before with a toast when its change is refused', async () => {
    const user = userEvent.setup();
    answer.entryUpdate = async () => errorResponse(404, 'Resource not found');
    serveOnlyFirstLoad();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Hide .+$/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    // The refetches never answer: the editor showed the group visible again by itself.
    expect(within(rowOf('Hendricks')).getByRole('button', { name: /^Hide .+$/ })).toBeInTheDocument();
  });

  it('deletes a section with a single request', async () => {
    const user = userEvent.setup();
    storeMenu({ sections: [gins], bottles: [makeEntry(10, hendricks, 4), makeEntry(12, lillet)] });
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: /^Delete .+$/ }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription(/^Delete the section ".+"\? Its bottles move to "No section"\.$/);
    await user.click(within(confirmation).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(received.sectionDeletes).toEqual([4]));
    expect(received.entryUpdates).toEqual([]);
    expect(within(compositionCard()).queryByRole('heading', { name: 'Gins' })).not.toBeInTheDocument();
  });

  it('removes a group from a system menu in one request and lists it as removed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');
    await waitFor(() => expect(received.exclusionReads).toEqual([5]));
    await waitFor(() => expect(within(excludedCard()).getByText('No bottle removed from this menu.')).toBeInTheDocument());

    await removeGroup(user, 'Hendricks');

    await waitFor(() => expect(received.excludes).toEqual([[1, 2]]));
    expect(received.removes).toEqual([]);
    expect(within(compositionCard()).queryByText('Hendricks')).not.toBeInTheDocument();
    // One row for the two identical bottles, as in the menu.
    await waitFor(() => expect(within(excludedCard()).getAllByText('Hendricks')).toHaveLength(1));
    expect(within(rowOf('Hendricks', excludedCard())).getByText(/^×.+$/)).toBeInTheDocument();
  });

  it('puts both lists back with a toast when the removal fails', async () => {
    const user = userEvent.setup();
    answer.exclude = async () => errorResponse(400, 'Not a system menu');
    serveOnlyFirstLoad();
    renderPage();
    await screen.findByText('Hendricks');
    await waitFor(() => expect(within(excludedCard()).getByText('No bottle removed from this menu.')).toBeInTheDocument());

    await removeGroup(user, 'Hendricks');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not a system menu'));
    // The refetches never answer: the editor put both lists back by itself.
    expect(within(compositionCard()).getByText('Hendricks')).toBeInTheDocument();
    expect(within(excludedCard()).queryByText('Hendricks')).not.toBeInTheDocument();
    expect(within(excludedCard()).getByText('No bottle removed from this menu.')).toBeInTheDocument();
  });

  it('keeps the group when the removal is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Remove .+ from the menu$/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(received.excludes).toEqual([]);
    expect(within(compositionCard()).getByText('Hendricks')).toBeInTheDocument();
  });

  it('puts a group of removed bottles back at the end of the menu in one request', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: /^Put .+ back in the menu$/ }));

    await waitFor(() => expect(compositionNames()).toEqual(['Hendricks', 'Lillet', 'Campari']));
    expect(received.restores).toEqual([[6, 7]]);
    expect(within(excludedCard()).queryByText('Campari')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Campari', compositionCard())).getByRole('button', { name: /^Move .+ up$/ })).toBeEnabled());
    expect(within(rowOf('Campari', compositionCard())).getByText(/^×.+$/)).toBeInTheDocument();
  });

  it('shows the removed bottles again with a toast when putting them back fails', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    answer.restore = async () => errorResponse(404, 'Resource not found');
    serveOnlyFirstLoad();
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: /^Put .+ back in the menu$/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    // The refetches never answer: the editor put both lists back by itself.
    expect(within(excludedCard()).getByText('Campari')).toBeInTheDocument();
    expect(within(compositionCard()).queryByText('Campari')).not.toBeInTheDocument();
  });

  it('keeps the whole group removed when the server refuses to put it back', async () => {
    const user = userEvent.setup();
    storeMenu({}, removedCamparis());
    // The server puts back every bottle of the group or none of them.
    answer.restore = async () => errorResponse(404, 'Resource not found');
    renderPage();

    await user.click(await within(await screen.findByRole('group')).findByRole('button', { name: /^Put .+ back in the menu$/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(received.restores).toEqual([[6, 7]]);
    expect(within(compositionCard()).queryByText('Campari')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('Campari', excludedCard())).getByText(/^×.+$/)).toBeInTheDocument());
  });

  it('tells which removed bottle is no longer checked, and only takes it off the list', async () => {
    const user = userEvent.setup();
    storeMenu({}, [exclusionOf(makeBottle(6, 'Campari', { isApero: false })), exclusionOf(emptyAperol)]);
    // The answer never comes: the screen shows what the editor expects from the server.
    answer.restore = async () => pendingResponse();
    renderPage();
    await within(await screen.findByRole('group')).findByText('Campari');
    const row = rowOf('Campari', excludedCard());
    expect(within(row).getByText('No longer checked as aperitif: "Put back" only takes it off this list. The menu gets it back once it is checked as aperitif again.')).toBeInTheDocument();
    expect(within(rowOf('Aperol', excludedCard())).queryByText('No longer checked as aperitif: "Put back" only takes it off this list. The menu gets it back once it is checked as aperitif again.')).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /^Put .+ back in the menu$/ }));

    await waitFor(() => expect(received.restores).toEqual([[6]]));
    expect(within(excludedCard()).queryByText('Campari')).not.toBeInTheDocument();
    expect(compositionNames()).toEqual(['Hendricks', 'Lillet']);
  });

  it('renames a system menu but keeps its slug read-only', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByDisplayValue('Apéritifs');
    expect(name).toBeEnabled();
    expect(screen.getByDisplayValue('aperitifs')).toHaveAttribute('readonly');
    expect(screen.getByText('The address of a system menu cannot change.')).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'Apéros');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(received.menuUpdates).toEqual([{
      name: 'Apéros', description: 'Before dinner', isPublic: true,
    }]));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Menu updated'));
  });

  it('saves the menu info after the composition changes still waiting', async () => {
    const user = userEvent.setup();
    const answers = holdEntryUpdates();
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(within(rowOf('Lillet')).getByRole('button', { name: /^Hide .+$/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(received.entryUpdates).toHaveLength(1));
    expect(received.menuUpdates).toEqual([]);

    answers[0]!();
    await waitFor(() => expect(received.menuUpdates).toHaveLength(1));
    await waitFor(() => expect(received.menuReads).toHaveLength(2));
    expect(within(rowOf('Lillet')).getByRole('button', { name: /^Show .+$/ })).toBeInTheDocument();
  });

  it('shows the bottles a sync added', async () => {
    const user = userEvent.setup();
    answer.sync = async () => {
      setEntries([...storedEntries(), makeEntry(60, campari)]);
      return HttpResponse.json({ message: 'ok', added: 1, removed: 0 });
    };
    renderPage();
    await screen.findByText('Hendricks');

    await user.click(screen.getByRole('button', { name: 'Synchronize' }));

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

    await user.click(screen.getByRole('button', { name: 'Synchronize' }));
    await user.click(within(rowOf('Lillet')).getByRole('button', { name: /^Move .+ up$/ }));
    await waitFor(() => expect(received.syncs).toHaveLength(1));
    expect(received.reorders).toEqual([]);
    finishSync();

    // Campari, added by the sync, is not on screen when the move is clicked: it keeps its place last.
    await waitFor(() => expect(received.reorders).toEqual([[12, 10, 11, 60]]));
    await waitFor(() => expect(compositionNames()).toEqual(['Lillet', 'Hendricks', 'Campari']));
  });

  describe('personal menu', () => {
    it('offers the bottles checked for its type that are not in it yet, without sync nor removed bottles', async () => {
      storePersonalMenu();
      const { container } = renderPage();
      await screen.findByText('Hendricks');

      expect(screen.getByRole('heading', { name: 'Manage an aperitifs menu' })).toBeInTheDocument();
      expect(screen.getByText('Choose the bottles of this menu among the bottles checked as aperitif. Unchecking a bottle removes it from this menu.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Synchronize' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Removed bottles \(.+\)/)).not.toBeInTheDocument();
      expect(received.exclusionReads).toEqual([]);
      expect(screen.getByDisplayValue('summer-aperos')).not.toHaveAttribute('readonly');
      expect(within(choicesCard()).getByText('Bottles checked as aperitif that are not in this menu yet. An empty bottle stays hidden from guests until it is refilled.')).toBeInTheDocument();
      // Hendricks and Lillet are in the menu, Chartreuse is a digestif, the vodka is not checked.
      expect(await within(await findChoicesCard()).findByText('Campari')).toBeInTheDocument();
      expect(choiceNames()).toEqual(['Campari', 'Aperol']);
      expect(within(rowOf('Campari', choicesCard())).getByText(/^×.+$/)).toBeInTheDocument();
      // An empty bottle can be added: it stays hidden from guests until refilled.
      expect(within(rowOf('Aperol', choicesCard())).getByText('Empty')).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
    });

    it('offers the digestifs only on a digestifs menu', async () => {
      storePersonalMenu({ type: 'DIGESTIFS', slug: 'after-dinner', bottles: [] });
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Manage a digestifs menu' })).toBeInTheDocument();
      expect(screen.getByText('No bottles yet. Add bottles checked as digestif from the list below.')).toBeInTheDocument();
      expect(await within(await findChoicesCard()).findByText('Chartreuse')).toBeInTheDocument();
      expect(choiceNames()).toEqual(['Chartreuse']);
    });

    it('says so when every bottle checked for its type is already in it', async () => {
      storePersonalMenu();
      stored.bottles = [hendricks, sameHendricks, lillet, chartreuse];
      renderPage();

      expect(await within(await findChoicesCard()).findByText('Every bottle checked as aperitif is already in this menu. Check more bottles as aperitif to add them here.')).toBeInTheDocument();
      expect(within(choicesCard()).queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('filters the bottles to add by name or category', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      renderPage();
      await within(await findChoicesCard()).findByText('Campari');
      const search = within(choicesCard()).getByRole('searchbox', { name: 'Search the bottles to add' });

      await user.type(search, 'camp');
      expect(choiceNames()).toEqual(['Campari']);

      await user.clear(search);
      await user.type(search, 'gin');
      expect(choiceNames()).toEqual(['Campari', 'Aperol']);

      await user.type(search, ' tonic');
      expect(choiceNames()).toEqual([]);
      expect(within(choicesCard()).getByText('No results')).toBeInTheDocument();
    });

    it('adds a group of identical bottles in one request and shows it at once', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      serveOnlyFirstLoad();
      renderPage();
      await within(await findChoicesCard()).findByText('Campari');

      await addGroup(user, 'Campari');

      // The refetches never answer: the editor shows the new group by itself.
      expect(compositionNames()).toEqual(['Hendricks', 'Lillet', 'Campari']);
      expect(within(rowOf('Campari', compositionCard())).getByText(/^×.+$/)).toBeInTheDocument();
      expect(choiceNames()).toEqual(['Aperol']);
      await waitFor(() => expect(received.adds).toEqual([[6, 7]]));
      expect(storedEntries().map((entry) => entry.bottleId)).toEqual([1, 2, 3, 6, 7]);
    });

    it('keeps an added group after the refetch, once the server gave its ids', async () => {
      const user = userEvent.setup();
      storePersonalMenu({ bottles: [] });
      renderPage();
      await within(await findChoicesCard()).findByText('Aperol');

      await addGroup(user, 'Aperol');

      await waitFor(() => expect(received.menuReads).toHaveLength(2));
      await waitFor(() => expect(within(rowOf('Aperol', compositionCard())).getByRole('button', { name: /^Hide .+$/ })).toBeEnabled());
      expect(within(rowOf('Aperol', compositionCard())).getByText('Empty')).toBeInTheDocument();
      expect(received.adds).toEqual([[8]]);
    });

    it('takes an added group back with a toast when the server refuses it', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      answer.add = async () => errorResponse(400, 'This bottle cannot go in this menu');
      serveOnlyFirstLoad();
      renderPage();
      await within(await findChoicesCard()).findByText('Campari');

      await addGroup(user, 'Campari');

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This bottle cannot go in this menu'));
      // The refetches never answer: the editor took the group back by itself.
      expect(compositionNames()).toEqual(['Hendricks', 'Lillet']);
      expect(choiceNames()).toEqual(['Campari', 'Aperol']);
    });

    it('removes a group in one request, without confirmation nor exclusion, and offers it again', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      renderPage();
      await within(await findChoicesCard()).findByText('Campari');

      await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Remove .+ from the menu$/ }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(compositionNames()).toEqual(['Lillet']);
      await waitFor(() => expect(received.removes).toEqual([[10, 11]]));
      expect(received.excludes).toEqual([]);
      await waitFor(() => expect(received.menuReads).toHaveLength(2));
      expect(choiceNames()).toEqual(['Hendricks', 'Campari', 'Aperol']);
      expect(compositionNames()).toEqual(['Lillet']);
    });

    it('shows a group again with a toast when its removal is refused', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      answer.remove = async () => errorResponse(404, 'Resource not found');
      serveOnlyFirstLoad();
      renderPage();
      await within(await findChoicesCard()).findByText('Campari');

      await user.click(within(rowOf('Hendricks')).getByRole('button', { name: /^Remove .+ from the menu$/ }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resource not found'));
      expect(compositionNames()).toEqual(['Hendricks', 'Lillet']);
      expect(choiceNames()).toEqual(['Campari', 'Aperol']);
    });

    it('shows an error with a retry when the bottles cannot be loaded', async () => {
      const user = userEvent.setup();
      storePersonalMenu();
      let bottleReads = 0;
      server.use(http.get('/api/bottles', () => {
        bottleReads += 1;
        return bottleReads === 1 ? errorResponse(500, 'Server error') : HttpResponse.json(stored.bottles);
      }));
      renderPage();
      await screen.findByText('Hendricks');

      await user.click(await within(choicesCard()).findByRole('button', { name: 'Retry' }));

      expect(await within(await findChoicesCard()).findByText('Campari')).toBeInTheDocument();
    });
  });

  it('titles a digestifs menu as such and shows its empty state', async () => {
    storeMenu({ type: 'DIGESTIFS', slug: 'digestifs', bottles: [] });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Manage the digestifs menu' })).toBeInTheDocument();
    expect(screen.getByText('No bottles. Check bottles as digestif, then synchronize.')).toBeInTheDocument();
  });

  it('opens the cocktail editor for a cocktail menu reached by its bottles URL', async () => {
    storeMenu({ type: 'COCKTAILS', slug: 'summer', bottles: [] });
    renderPage();

    expect(await screen.findByText('cocktail editor')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/menus/5');
    expect(screen.queryByRole('heading', { name: 'Bottles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add bottles' })).not.toBeInTheDocument();
  });

  it('shows an error when the menu does not exist', async () => {
    answer.menuRead = async () => errorResponse(404, 'Resource not found');
    renderPage();

    expect(await screen.findByText('This menu could not be loaded.')).toBeInTheDocument();
  });
});
