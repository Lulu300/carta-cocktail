import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, screen, waitFor, within } from '../../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../../test/feedback';
import { qk } from '../../../queries/keys';
import type { Menu, MenuSection } from '../../../types';
import MenuSectionsManager from './MenuSectionsManager';

vi.mock('../../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api')>('../../../services/api');
  return {
    ApiError: actual.ApiError,
    menuSections: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
  };
});

import { ApiError, menuSections as api } from '../../../services/api';

const starters: MenuSection = { id: 1, menuId: 3, name: 'Starters', position: 0 };
const classics: MenuSection = { id: 2, menuId: 3, name: 'Classics', position: 1 };

const menu: Menu = {
  id: 3, name: 'Summer', description: null, slug: 'summer', type: 'COCKTAILS', isPublic: false,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', sections: [starters, classics],
  cocktails: [{ id: 9, menuId: 3, cocktailId: 4, menuSectionId: 1, position: 0, isHidden: false }],
};

function renderManager(sections: MenuSection[] = [starters, classics]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(qk.menu(3), menu);
  renderWithFeedback(<MenuSectionsManager menuId={3} sections={sections} itemLabel="cocktails" />, { queryClient });
  return queryClient;
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.create).mockResolvedValue({ id: 5, menuId: 3, name: 'Tiki', position: 2 });
  vi.mocked(api.update).mockResolvedValue(starters);
  vi.mocked(api.delete).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.reorder).mockResolvedValue({ message: 'ok' });
});

afterEach(clearToasts);

describe('MenuSectionsManager', () => {
  it('says how a menu without sections is shown', () => {
    renderManager([]);

    expect(screen.getByText('menus.sections.empty.cocktails')).toBeInTheDocument();
  });

  it('creates a section from the modal', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole('button', { name: 'menus.sections.add' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/menus.sections.name/), '  Tiki ');
    await user.click(within(dialog).getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith(3, { name: 'Tiki' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renames a section', async () => {
    const user = userEvent.setup();
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.rename' }));
    const field = screen.getByRole('textbox', { name: 'menus.sections.name' });
    await user.clear(field);
    await user.type(field, 'Openers{Enter}');

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { name: 'Openers' }));
    expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.[0].name).toBe('Openers');
  });

  it('leaves the name unchanged when the rename is cancelled', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.rename' }));
    await user.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(api.update).not.toHaveBeenCalled();
    expect(screen.getByText('Starters')).toBeInTheDocument();
  });

  it('deletes a section once confirmed and moves its items out of any section', async () => {
    const user = userEvent.setup();
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.delete' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleDescription('menus.sections.confirmDelete.cocktails');
    await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(1));
    const cached = queryClient.getQueryData<Menu>(qk.menu(3));
    expect(cached?.sections?.map((section) => section.id)).toEqual([2]);
    expect(cached?.cocktails?.[0].menuSectionId).toBeNull();
  });

  it('keeps a section when the deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.sections.delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('reorders the sections with every section id', async () => {
    const user = userEvent.setup();
    const queryClient = renderManager();

    expect(within(rowOf('Starters')).getByRole('button', { name: 'menus.moveUp' })).toBeDisabled();
    await user.click(within(rowOf('Classics')).getByRole('button', { name: 'menus.moveUp' }));

    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith(3, [2, 1]));
    expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.map((section) => section.name)).toEqual(['Classics', 'Starters']);
  });

  it('restores the sections and shows the error when the server refuses the order', async () => {
    const user = userEvent.setup();
    vi.mocked(api.reorder).mockRejectedValue(new ApiError(400, 'The new order must list every item of the menu'));
    const queryClient = renderManager();

    await user.click(within(rowOf('Starters')).getByRole('button', { name: 'menus.moveDown' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The new order must list every item'));
    expect(queryClient.getQueryData<Menu>(qk.menu(3))?.sections?.map((section) => section.id)).toEqual([1, 2]);
  });
});
