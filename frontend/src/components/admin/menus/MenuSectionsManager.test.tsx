import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, screen, waitFor, within } from '../../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../../test/feedback';
import { qk } from '../../../queries/keys';
import { buildMenu, buildMenuCocktail, buildMenuSection } from '../../../test/factories';
import { captureRequest, mockApiError, mockApiResponse } from '../../../test/msw/utils';
import type { Menu, MenuSection } from '../../../types';
import MenuSectionsManager from './MenuSectionsManager';

const starters = buildMenuSection({ id: 1, menuId: 3, name: 'Starters', position: 0 });
const classics = buildMenuSection({ id: 2, menuId: 3, name: 'Classics', position: 1 });

const menu = buildMenu({
  id: 3, name: 'Summer', slug: 'summer', isPublic: false, sections: [starters, classics],
  cocktails: [buildMenuCocktail({ id: 9, menuId: 3, cocktail: { id: 4 }, menuSectionId: 1, position: 0 })],
});

function renderManager(sections: MenuSection[] = [starters, classics]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(qk.menu(3), menu);
  renderWithFeedback(<MenuSectionsManager menuId={3} sections={sections} itemLabel="cocktails" />, { queryClient });
  return queryClient;
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

beforeEach(() => {
  mockApiResponse('post', '/api/menu-sections/menu/:menuId/sections', buildMenuSection({ id: 5, menuId: 3, name: 'Tiki', position: 2 }), 201);
  mockApiResponse('put', '/api/menu-sections/sections/:id', { ...starters, name: 'Openers' });
});

afterEach(clearToasts);

describe('MenuSectionsManager', () => {
  it('says how a menu without sections is shown', () => {
    renderManager([]);

    expect(screen.getByText('menus.sections.empty.cocktails')).toBeInTheDocument();
  });

  it('creates a section from the modal', async () => {
    const user = userEvent.setup();
    const created = captureRequest('post', '/api/menu-sections/menu/:menuId/sections');
    renderManager();

    await user.click(screen.getByRole('button', { name: 'menus.sections.add' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/menus.sections.name/), '  Tiki ');
    await user.click(within(dialog).getByRole('button', { name: 'common.create' }));

    expect((await created.url).pathname).toBe('/api/menu-sections/menu/3/sections');
    expect(await created.body).toEqual({ name: 'Tiki' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renames a section', async () => {
    const user = userEvent.setup();
    const renamed = captureRequest('put', '/api/menu-sections/sections/:id');
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.rename' }));
    const field = screen.getByRole('textbox', { name: 'menus.sections.name' });
    await user.clear(field);
    await user.type(field, 'Openers{Enter}');

    expect((await renamed.url).pathname).toBe('/api/menu-sections/sections/1');
    expect(await renamed.body).toEqual({ name: 'Openers' });
    await waitFor(() => expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.[0].name).toBe('Openers'));
  });

  it('leaves the name unchanged when the rename is cancelled', async () => {
    const user = userEvent.setup();
    const renamed = captureRequest('put', '/api/menu-sections/sections/:id');
    renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.rename' }));
    await user.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(renamed.count()).toBe(0);
    expect(screen.getByText('Starters')).toBeInTheDocument();
  });

  it('deletes a section once confirmed and moves its items out of any section', async () => {
    const user = userEvent.setup();
    const deleted = captureRequest('delete', '/api/menu-sections/sections/:id');
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.delete' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('menus.sections.confirmDelete.cocktails');
    await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

    expect((await deleted.url).pathname).toBe('/api/menu-sections/sections/1');
    await waitFor(() => expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections).toHaveLength(1));
    const cached = queryClient.getQueryData<Menu>(qk.menu(3));
    expect(cached?.sections?.map((section) => section.id)).toEqual([2]);
    expect(cached?.cocktails?.[0].menuSectionId).toBeNull();
  });

  it('keeps a section when the deletion is cancelled', async () => {
    const user = userEvent.setup();
    const deleted = captureRequest('delete', '/api/menu-sections/sections/:id');
    renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleted.count()).toBe(0);
  });

  it('reorders the sections with every section id', async () => {
    const user = userEvent.setup();
    const reordered = captureRequest('post', '/api/menu-sections/menu/:menuId/sections/reorder');
    const queryClient = renderManager();

    expect(within(rowOf('Starters')).getByRole('button', { name: 'menus.moveUp' })).toBeDisabled();
    await user.click(within(rowOf('Classics')).getByRole('button', { name: 'menus.moveUp' }));

    expect((await reordered.url).pathname).toBe('/api/menu-sections/menu/3/sections/reorder');
    expect(await reordered.body).toEqual({ sectionIds: [2, 1] });
    expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.map((section) => section.name)).toEqual(['Classics', 'Starters']);
  });

  it('restores the sections and shows the error when the server refuses the order', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/menu-sections/menu/:menuId/sections/reorder', 400, 'The new order must list every item of the menu');
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.moveDown' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The new order must list every item'));
    expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.map((section) => section.id)).toEqual([1, 2]);
  });
});
