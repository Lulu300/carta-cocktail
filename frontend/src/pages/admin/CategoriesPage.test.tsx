import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { qk } from '../../queries/keys';
import { buildCategory, buildCategoryType } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse } from '../../test/msw/utils';
import CategoriesPage from './CategoriesPage';

const spirit = buildCategoryType({ name: 'SPIRIT', color: 'blue', _count: { categories: 1 } });
const syrup = buildCategoryType({ name: 'SYRUP', color: 'red', _count: { categories: 1 } });
const garnish = buildCategoryType({ name: 'GARNISH', color: 'green', _count: { categories: 0 } });
const vodka = buildCategory({ id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: spirit, desiredStock: 2, _count: { bottles: 3 } });
const grenadine = buildCategory({ id: 2, name: 'Grenadine', type: 'SYRUP', categoryType: syrup, _count: { bottles: 1 } });

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
  mockApiResponse('get', '/api/categories', [vodka, grenadine]);
  mockApiResponse('get', '/api/category-types', [spirit, syrup, garnish]);
});

afterEach(clearToasts);

describe('CategoriesPage', () => {
  it('lists the categories with their stock settings and bottle count', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'categories.title' })).toBeInTheDocument();
    expect(screen.getByText('Grenadine')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('30%')).toHaveLength(2);
  });

  it('never shows "no results" while the categories are loading', () => {
    mockApiPending('get', '/api/categories');
    renderPage();

    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without categories', async () => {
    mockApiResponse('get', '/api/categories', []);
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
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Rum');
      const desiredStock = within(categoryDialog()).getByLabelText('categories.desiredStock');
      await user.clear(desiredStock);
      await user.type(desiredStock, '3');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      expect(await created.body).toEqual({
        name: 'Rum',
        type: 'SPIRIT',
        desiredStock: 3,
        minimumPercent: 30,
        nameTranslations: null,
      });
      expect(await screen.findByText('categories.created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('creates a category of a custom type, upper-cased', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('categories.type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('categories.customType'), 'mixer');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      expect(await created.body).toEqual({
        name: 'Tonic',
        type: 'MIXER',
        desiredStock: 1,
        minimumPercent: 30,
        nameTranslations: null,
      });
    });

    it('does not send a blank custom type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'categories.add' }));

      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('categories.type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('categories.customType'), '   ');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      expect(created.count()).toBe(0);
      expect(categoryDialog()).toBeInTheDocument();
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiPending('post', '/api/categories');
      const created = captureRequest('post', '/api/categories');
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'categories.add' }));
      await user.type(within(categoryDialog()).getByLabelText(/categories\.name/), 'Rum');
      const save = within(categoryDialog()).getByRole('button', { name: 'common.save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      expect(created.count()).toBe(1);
    });

    it('updates a category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/categories/:id');
      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

      const name = within(categoryDialog()).getByDisplayValue('Vodka');
      await user.clear(name);
      await user.type(name, 'Gin');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'common.save' }));

      expect((await updated.url).pathname).toBe('/api/categories/1');
      expect(await updated.body).toEqual({
        name: 'Gin',
        type: 'SPIRIT',
        desiredStock: 2,
        minimumPercent: 30,
        nameTranslations: null,
      });
      expect(await screen.findByText('categories.updated')).toBeInTheDocument();
    });

    it('shows a type missing from the list as a custom type', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/categories', [
        buildCategory({ name: 'Water', type: 'UNKNOWN', categoryType: null, _count: { bottles: 0 } }),
      ]);
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
      const deleted = captureRequest('delete', '/api/categories/:id');
      const reloaded = captureRequest('get', '/api/categories');

      await deleteFirstCategory(user);

      expect(await screen.findByText('categories.deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/categories/1');
      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([qk.categories, qk.categoryTypes, qk.bottles, qk.shortages, qk.availability]);
      await waitFor(() => expect(reloaded.count()).toBe(1));
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/categories/:id');

      await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(deleted.count()).toBe(0);
    });

    it('shows the backend message and the bottles of a category that still has some', async () => {
      const user = userEvent.setup();
      mockApiResponse('delete', '/api/categories/:id', {
        error: 'This category still has bottles',
        details: { cocktails: [], bottles: [{ id: 7, name: 'Absolut' }] },
      }, 409);
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
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'mixer');
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      expect(await created.body).toEqual({ name: 'MIXER', nameTranslations: null, color: 'gray' });
      expect(await screen.findByText('categoryTypes.created')).toBeInTheDocument();
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
    });

    it('does not create a type without a name', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), '  ');
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      expect(created.count()).toBe(0);
    });

    it('edits a type: name locked, translations open, color and translations sent', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/category-types/:name');
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'common.edit' })[0]);
      expect(within(manager).getByText('categoryTypes.edit')).toBeInTheDocument();
      expect(within(manager).getByDisplayValue('SPIRIT')).toBeDisabled();
      await user.type(within(manager).getByLabelText('Français'), 'Spiritueux');
      await user.click(within(manager).getByRole('button', { name: 'common.save' }));

      expect((await updated.url).pathname).toBe('/api/category-types/SPIRIT');
      expect(await updated.body).toEqual({
        nameTranslations: { fr: 'Spiritueux' },
        color: 'blue',
      });
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
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'bitter');
      await user.click(within(manager).getByRole('button', { name: 'colors.red' }));
      expect(within(manager).getByRole('button', { name: 'colors.red' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(within(manager).getByRole('button', { name: 'common.create' }));

      expect(await created.body).toEqual({ name: 'BITTER', nameTranslations: null, color: 'red' });
    });

    it('deletes an unused type after confirmation', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/category-types/:name');
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'common.delete' }));
      const confirmation = screen.getByRole('alertdialog');
      expect(confirmation).toHaveAccessibleDescription('categoryTypes.confirmDelete');
      await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));

      expect(await screen.findByText('categoryTypes.deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/category-types/GARNISH');
    });

    it('empties the form when the type being edited is deleted', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'common.edit' })[2]);
      expect(within(manager).getByDisplayValue('GARNISH')).toBeDisabled();
      await user.click(within(manager).getByRole('button', { name: 'common.delete' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

      await waitFor(() => expect(within(manager).getByText('categoryTypes.add')).toBeInTheDocument());
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
    });

    it('keeps the form on the type being edited when another type is deleted', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'common.edit' })[0]);
      await user.click(within(manager).getByRole('button', { name: 'common.delete' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

      expect(await screen.findByText('categoryTypes.deleted')).toBeInTheDocument();
      expect(within(manager).getByDisplayValue('SPIRIT')).toBeDisabled();
    });

    it('shows the backend message in a toast when a type cannot be deleted', async () => {
      const user = userEvent.setup();
      mockApiError('delete', '/api/category-types/:name', 400, 'Type is in use by categories');
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
