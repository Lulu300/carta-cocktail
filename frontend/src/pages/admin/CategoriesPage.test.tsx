import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { clearToasts, createTestQueryClient, fireEvent, renderWithFeedback, screen, waitFor, within } from '../../test/test-utils';
import { qk } from '../../queries/keys';
import CategoriesPage from './CategoriesPage';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    categories: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    categoryTypes: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

import { ApiError, categories as api, categoryTypes as ctApi } from '../../services/api';

const mockApiList = vi.mocked(api.list);
const mockApiCreate = vi.mocked(api.create);
const mockApiUpdate = vi.mocked(api.update);
const mockApiDelete = vi.mocked(api.delete);
const mockCtApiList = vi.mocked(ctApi.list);
const mockCtApiCreate = vi.mocked(ctApi.create);
const mockCtApiUpdate = vi.mocked(ctApi.update);
const mockCtApiDelete = vi.mocked(ctApi.delete);

const mockCategories = [
  { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue', nameTranslations: null }, desiredStock: 2, minimumPercent: 30, _count: { bottles: 3 } },
  { id: 2, name: 'Grenadine', type: 'SYRUP', categoryType: { name: 'SYRUP', color: 'red', nameTranslations: null }, desiredStock: 1, minimumPercent: 30, _count: { bottles: 1 } },
];
const mockCatTypes = [
  { name: 'SPIRIT', color: 'blue', nameTranslations: null, _count: { categories: 1 } },
  { name: 'SYRUP', color: 'red', nameTranslations: null, _count: { categories: 1 } },
  { name: 'GARNISH', color: 'green', nameTranslations: null, _count: { categories: 0 } },
];

type User = ReturnType<typeof userEvent.setup>;

function renderPage() {
  return renderWithFeedback(<CategoriesPage />);
}

async function renderLoadedPage() {
  renderPage();
  await screen.findByText('Vodka');
}

function categoryDialog() {
  return screen.getByRole('dialog');
}

async function openTypesManager(user: User) {
  await user.click(screen.getByRole('button', { name: 'categoryTypes.manage' }));
  return screen.getByRole('dialog', { name: 'categoryTypes.title' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiList.mockResolvedValue(mockCategories as never);
  mockCtApiList.mockResolvedValue(mockCatTypes as never);
  mockApiCreate.mockResolvedValue({} as never);
  mockApiUpdate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
  mockCtApiCreate.mockResolvedValue({} as never);
  mockCtApiUpdate.mockResolvedValue({} as never);
  mockCtApiDelete.mockResolvedValue({} as never);
});

afterEach(clearToasts);

describe('CategoriesPage', () => {
  it('renders the title and the action buttons', () => {
    renderPage();
    expect(screen.getByText('categories.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'categories.add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'categoryTypes.manage' })).toBeInTheDocument();
  });

  it('lists the categories with their stock settings and bottle count', async () => {
    await renderLoadedPage();
    expect(screen.getByText('Grenadine')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('30%')).toHaveLength(2);
  });

  it('never shows "no results" while the categories are loading', () => {
    mockApiList.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without categories', async () => {
    mockApiList.mockResolvedValue([] as never);
    renderPage();
    expect(await screen.findByText('common.noResults')).toBeInTheDocument();
  });

  it('filters the categories by name', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('common.search'), 'Vod');

    expect(screen.getByText('Vodka')).toBeInTheDocument();
    expect(screen.queryByText('Grenadine')).not.toBeInTheDocument();
  });

  describe('category form', () => {
    it('creates a category with the first type by default and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Rum');
      const desiredStock = within(categoryDialog()).getByLabelText('categories.desiredStock');
      await user.clear(desiredStock);
      await user.type(desiredStock, '3');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith({
        name: 'Rum',
        type: 'SPIRIT',
        desiredStock: 3,
        minimumPercent: 30,
        nameTranslations: null,
      }));
      expect(await screen.findByText('categories.created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('creates a category of a custom type, upper-cased', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('categories.type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('categories.customType'), 'mixer');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith({
        name: 'Tonic',
        type: 'MIXER',
        desiredStock: 1,
        minimumPercent: 30,
        nameTranslations: null,
      }));
    });

    it('does not send a blank custom type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('categories.type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('categories.customType'), '   ');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      expect(mockApiCreate).not.toHaveBeenCalled();
      expect(categoryDialog()).toBeInTheDocument();
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiCreate.mockReturnValue(new Promise(() => {}));
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'categories.add' }));
      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Rum');
      const save = within(categoryDialog()).getByRole('button', { name: 'common.save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      expect(mockApiCreate).toHaveBeenCalledTimes(1);
    });

    it('updates a category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

      const name = within(categoryDialog()).getByDisplayValue('Vodka');
      await user.clear(name);
      await user.type(name, 'Gin');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledWith(1, {
        name: 'Gin',
        type: 'SPIRIT',
        desiredStock: 2,
        minimumPercent: 30,
        nameTranslations: null,
      }));
      expect(await screen.findByText('categories.updated')).toBeInTheDocument();
    });

    it('shows a type missing from the list as a custom type', async () => {
      const user = userEvent.setup();
      mockApiList.mockResolvedValue([
        { id: 3, name: 'Water', type: 'UNKNOWN', categoryType: null, desiredStock: 1, minimumPercent: 30, _count: { bottles: 0 } },
      ] as never);
      renderPage();
      await screen.findByText('Water');

      await user.click(screen.getByRole('button', { name: 'common.edit' }));

      expect(within(categoryDialog()).getByLabelText('categories.type')).toHaveValue('__OTHER__');
      expect(within(categoryDialog()).getByPlaceholderText('categories.customType')).toHaveValue('UNKNOWN');
    });

    it('collapses the translations block again when another category is opened', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.translations' }));
      expect(within(categoryDialog()).getByLabelText('Français')).toBeInTheDocument();
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.cancel' }));

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

      expect(within(categoryDialog()).getByDisplayValue('Grenadine')).toBeInTheDocument();
      expect(within(categoryDialog()).queryByLabelText('Français')).not.toBeInTheDocument();
    });
  });

  describe('category deletion', () => {
    async function deleteFirstCategory(user: User) {
      await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
      const confirmation = screen.getByRole('alertdialog');
      expect(confirmation).toHaveAccessibleDescription('categories.confirmDelete');
      await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));
    }

    it('deletes after confirmation and refreshes everything that shows categories', async () => {
      const user = userEvent.setup();
      const queryClient = createTestQueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      renderWithFeedback(<CategoriesPage />, { queryClient });
      await screen.findByText('Vodka');

      await deleteFirstCategory(user);

      await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith(1));
      expect(await screen.findByText('categories.deleted')).toBeInTheDocument();
      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([qk.categories, qk.categoryTypes, qk.bottles, qk.shortages, qk.availability]);
      await waitFor(() => expect(mockApiList).toHaveBeenCalledTimes(2));
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

      expect(mockApiDelete).not.toHaveBeenCalled();
    });

    it('shows the backend message and the bottles of a category that still has some', async () => {
      const user = userEvent.setup();
      mockApiDelete.mockRejectedValue(new ApiError(409, 'This category still has bottles', {
        error: 'This category still has bottles',
        details: { cocktails: [], bottles: [{ id: 7, name: 'Absolut' }] },
      }));
      await renderLoadedPage();

      await deleteFirstCategory(user);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This category still has bottles'));
      expect(screen.getByRole('alert')).toHaveTextContent('deletion.usedByBottles');
      expect(screen.getByText('Vodka')).toBeInTheDocument();
    });
  });

  describe('category types manager', () => {
    it('lists the types with the number of categories using them', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      expect(within(manager).getByText('GARNISH', { selector: 'span.font-medium' })).toBeInTheDocument();
      expect(within(manager).getByText('(0)')).toBeInTheDocument();
    });

    it('creates a type, upper-cased, and empties the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'mixer');
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      await waitFor(() => expect(mockCtApiCreate).toHaveBeenCalledWith({ name: 'MIXER', nameTranslations: null, color: 'gray' }));
      expect(await screen.findByText('categoryTypes.created')).toBeInTheDocument();
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
    });

    it('does not create a type without a name', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), '  ');
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      expect(mockCtApiCreate).not.toHaveBeenCalled();
    });

    it('edits a type: name locked, translations open, color and translations sent', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'common.edit' })[0]);
      expect(within(manager).getByText('categoryTypes.edit')).toBeInTheDocument();
      expect(within(manager).getByDisplayValue('SPIRIT')).toBeDisabled();
      await user.type(within(manager).getByLabelText('Français'), 'Spiritueux');
      await user.click(within(manager).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockCtApiUpdate).toHaveBeenCalledWith('SPIRIT', {
        nameTranslations: { fr: 'Spiritueux' },
        color: 'blue',
      }));
      expect(await screen.findByText('categoryTypes.updated')).toBeInTheDocument();
      expect(within(manager).getByText('categoryTypes.add')).toBeInTheDocument();
    });

    it('cancels the edition of a type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'common.edit' })[0]);
      await user.click(within(manager).getByRole('button', { name: 'common.cancel' }));

      expect(within(manager).getByText('categoryTypes.add')).toBeInTheDocument();
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
      expect(within(manager).queryByLabelText('Français')).not.toBeInTheDocument();
    });

    it('sends the color picked for a new type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'bitter');
      const colorButtons = within(manager).getByText('categoryTypes.color').parentElement!.querySelectorAll('button');
      await user.click(colorButtons[0]);
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      await waitFor(() => expect(mockCtApiCreate).toHaveBeenCalledWith({ name: 'BITTER', nameTranslations: null, color: 'blue' }));
    });

    it('deletes an unused type after confirmation', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'common.delete' }));
      const confirmation = screen.getByRole('alertdialog');
      expect(confirmation).toHaveAccessibleDescription('categoryTypes.confirmDelete');
      await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

      await waitFor(() => expect(mockCtApiDelete).toHaveBeenCalledWith('GARNISH'));
      expect(await screen.findByText('categoryTypes.deleted')).toBeInTheDocument();
    });

    it('shows the backend message in a toast when a type cannot be deleted', async () => {
      const user = userEvent.setup();
      mockCtApiDelete.mockRejectedValue(new ApiError(400, 'Type is in use by categories'));
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'common.delete' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Type is in use by categories'));
    });

    it('disables the deletion of a type used by categories', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      const usedTypeButtons = within(manager).getAllByRole('button', { name: 'categoryTypes.cannotDelete' });
      expect(usedTypeButtons).toHaveLength(2);
      usedTypeButtons.forEach((button) => expect(button).toBeDisabled());
    });

    it('closes with its close button', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'common.close' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
