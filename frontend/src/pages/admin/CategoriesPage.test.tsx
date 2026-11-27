import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { qk } from '../../queries/keys';
import { axe } from '../../test/axe';
import { buildCategoryListItem, buildCategoryTypeListItem } from '../../test/factories';
import type { CategoryType } from '../../types';
import {
  captureRequest,
  mockApiError,
  mockApiPending,
  mockApiResponse,
  mockItemInUse,
} from '../../test/msw/utils';
import CategoriesPage from './CategoriesPage';

const spirit = buildCategoryTypeListItem({
  name: 'SPIRIT',
  color: 'blue',
  _count: { categories: 1 },
});
const syrup = buildCategoryTypeListItem({ name: 'SYRUP', color: 'red', _count: { categories: 1 } });
const garnish = buildCategoryTypeListItem({
  name: 'GARNISH',
  color: 'green',
  _count: { categories: 0 },
});
const vodka = buildCategoryListItem({
  id: 1,
  name: 'Vodka',
  type: 'SPIRIT',
  categoryType: spirit,
  desiredStock: 2,
  _count: { bottles: 3 },
});
const grenadine = buildCategoryListItem({
  id: 2,
  name: 'Grenadine',
  type: 'SYRUP',
  categoryType: syrup,
  _count: { bottles: 1 },
});
// Data older than v1.9.0 can hold these names: HTML would show ' SPIRIT ' as 'SPIRIT', and '' as nothing.
const spacedSpirit = buildCategoryTypeListItem({
  name: ' SPIRIT ',
  color: 'gray',
  _count: { categories: 1 },
});
const unnamed = buildCategoryTypeListItem({ name: '', color: 'gray', _count: { categories: 0 } });
const SPACED_SPIRIT_LABEL = '␣SPIRIT␣ (with spaces)';
// Data older than v1.15.0 can hold these: HTML shows each of them as 'X Y'.
const doubleSpaced = buildCategoryTypeListItem({
  name: 'X  Y',
  color: 'gray',
  _count: { categories: 1 },
});
const singleSpaced = buildCategoryTypeListItem({
  name: 'X Y',
  color: 'gray',
  _count: { categories: 0 },
});
const tabbed = buildCategoryTypeListItem({
  name: 'X\tY',
  color: 'gray',
  _count: { categories: 0 },
});
const DOUBLE_SPACED_LABEL = 'X␣␣Y (with spaces)';
// HTML shows a zero-width space as nothing: 'X\u200BY' looks exactly like 'XY'.
const zeroWidth = buildCategoryTypeListItem({
  name: 'X\u200BY',
  color: 'gray',
  _count: { categories: 1 },
});
const joined = buildCategoryTypeListItem({ name: 'XY', color: 'gray', _count: { categories: 0 } });
const ZERO_WIDTH_LABEL = 'X[U+200B]Y (with invisible characters)';
// HTML shows 'E' and a combining grave accent (U+0300) exactly like the composed 'È' (U+00C8).
const decomposed = buildCategoryTypeListItem({
  name: 'CRE\u0300ME',
  color: 'gray',
  _count: { categories: 1 },
});
const composed = buildCategoryTypeListItem({
  name: 'CR\u00C8ME',
  color: 'gray',
  _count: { categories: 0 },
});
const DECOMPOSED_LABEL = 'CRE\u0300ME (non-standard Unicode form)';

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
  await user.click(screen.getByRole('button', { name: 'Manage Types' }));
  return screen.getByRole('dialog', { name: 'Category Types' });
}

beforeEach(() => {
  mockApiResponse('get', '/api/categories', [vodka, grenadine]);
  mockApiResponse('get', '/api/category-types', [spirit, syrup, garnish]);
});

afterEach(clearToasts);

describe('CategoriesPage', () => {
  it('lists the categories with their stock settings and bottle count', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByText('Grenadine')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('30%')).toHaveLength(2);
  });

  it('never shows "no results" while the categories are loading', () => {
    mockApiPending('get', '/api/categories');
    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('shows "no results" once loaded without categories', async () => {
    mockApiResponse('get', '/api/categories', []);
    renderPage();
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('filters the categories by name', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('Search...'), 'Vod');

    expect(screen.getByText('Vodka')).toBeInTheDocument();
    expect(screen.queryByText('Grenadine')).not.toBeInTheDocument();
  });

  describe('type badge of a category whose type name HTML would hide', () => {
    /** The type cell of a category's row: its accessible name is what a screen reader reads. */
    async function typeCell(categoryName: string) {
      const row = (await screen.findByText(categoryName)).closest('tr');
      if (!row) throw new Error(`No row for ${categoryName}`);
      return within(row).getAllByRole('cell')[1];
    }

    /** A category of the given type, which the categories list sends with it. */
    const categoryOfType = (name: string, categoryType: CategoryType) =>
      buildCategoryListItem({ name, type: categoryType.name, categoryType });

    it('tells the stored names apart, and labels the empty name', async () => {
      mockApiResponse('get', '/api/categories', [
        categoryOfType('Rum', spacedSpirit),
        categoryOfType('Gin', spirit),
        categoryOfType('Water', unnamed),
        categoryOfType('Tonic', doubleSpaced),
      ]);
      renderPage();

      expect(await typeCell('Rum')).toHaveAccessibleName(SPACED_SPIRIT_LABEL);
      expect(await typeCell('Gin')).toHaveAccessibleName('SPIRIT');
      expect(await typeCell('Water')).toHaveAccessibleName('(no name)');
      expect(await typeCell('Tonic')).toHaveAccessibleName(DOUBLE_SPACED_LABEL);
    });

    it('adds the stored name to a translation that would hide it', async () => {
      const nameTranslations = { en: 'Spirits' };
      mockApiResponse('get', '/api/categories', [
        categoryOfType('Rum', { ...spacedSpirit, nameTranslations }),
        categoryOfType('Gin', { ...spirit, nameTranslations }),
        categoryOfType('Water', { ...unnamed, nameTranslations }),
      ]);
      renderPage();

      expect(await typeCell('Rum')).toHaveAccessibleName(`Spirits – ${SPACED_SPIRIT_LABEL}`);
      expect(await typeCell('Gin')).toHaveAccessibleName('Spirits');
      expect(await typeCell('Water')).toHaveAccessibleName('Spirits – (no name)');
    });
  });

  describe('category form', () => {
    it('creates a category with the first type by default and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Rum');
      const desiredStock = within(categoryDialog()).getByLabelText('Desired Stock');
      await user.clear(desiredStock);
      await user.type(desiredStock, '3');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toEqual({
        name: 'Rum',
        type: 'SPIRIT',
        desiredStock: 3,
        minimumPercent: 30,
        nameTranslations: null,
      });
      expect(await screen.findByText('Category created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('creates a category of a custom type, trimmed and upper-cased', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('Custom type'), '  mixer ');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toEqual({
        name: 'Tonic',
        type: 'MIXER',
        desiredStock: 1,
        minimumPercent: 30,
        nameTranslations: null,
      });
    });

    // Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT': the creation sends the type picked as stored.
    it('creates a category with a type picked from the list as it is stored', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [spirit, spacedSpirit]);
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Rum');
      await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), ' SPIRIT ');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toMatchObject({ name: 'Rum', type: ' SPIRIT ' });
    });

    it('does not send a blank custom type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('Custom type'), '   ');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(created.count()).toBe(0);
      const customType = within(categoryDialog()).getByPlaceholderText('Custom type');
      expect(customType).toHaveFocus();
      expect(customType).toHaveAccessibleDescription('Choose or enter a type with a name.');
      expect(within(categoryDialog()).getByLabelText('Type')).not.toHaveAttribute('aria-invalid');

      await user.type(customType, 'mixer');
      expect(
        within(categoryDialog()).queryByText('Choose or enter a type with a name.'),
      ).not.toBeInTheDocument();
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));
      expect(await created.body).toMatchObject({ type: 'MIXER' });
    });

    // A custom type is tidied as the backend stores it
    it('does not send a custom type of invisible or blank characters, and sends a typed one tidied', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Tonic');
      await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), '__OTHER__');
      const customType = within(categoryDialog()).getByPlaceholderText('Custom type');
      await user.type(customType, '\u200B\u2800');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(created.count()).toBe(0);
      expect(customType).toHaveAccessibleDescription('Choose or enter a type with a name.');

      await user.type(customType, 'mi\u200Bxer');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));
      expect(await created.body).toMatchObject({ type: 'MIXER' });
    });

    // Upper case decomposes 'ΐ' into 'Ι\u0308\u0301': the type is composed after it
    it.each([
      ['cre\u0300me', 'CR\u00C8ME'],
      ['\u0390', '\u03AA\u0301'],
    ])('sends the custom type %j composed, as %j', async (typed, sent) => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/categories');
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Cassis');
      await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), '__OTHER__');
      await user.type(within(categoryDialog()).getByPlaceholderText('Custom type'), typed);
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toMatchObject({ type: sent });
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiPending('post', '/api/categories');
      const created = captureRequest('post', '/api/categories');
      await renderLoadedPage();
      await user.click(screen.getByRole('button', { name: 'Add Category' }));
      await user.type(within(categoryDialog()).getByLabelText(/Name/), 'Rum');
      const save = within(categoryDialog()).getByRole('button', { name: 'Save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      expect(created.count()).toBe(1);
    });

    it('updates a category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/categories/:id');
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);

      const name = within(categoryDialog()).getByDisplayValue('Vodka');
      await user.clear(name);
      await user.type(name, 'Gin');
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect((await updated.url).pathname).toBe('/api/categories/1');
      expect(await updated.body).toEqual({
        name: 'Gin',
        type: 'SPIRIT',
        desiredStock: 2,
        minimumPercent: 30,
        nameTranslations: null,
      });
      expect(await screen.findByText('Category updated')).toBeInTheDocument();
    });

    // Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT': the edit sends the type as stored.
    it('keeps a type with surrounding spaces when a category is saved', async () => {
      const user = userEvent.setup();
      const spacedSpirit = buildCategoryTypeListItem({
        name: ' SPIRIT ',
        color: 'gray',
        _count: { categories: 1 },
      });
      mockApiResponse('get', '/api/category-types', [spirit, spacedSpirit]);
      mockApiResponse('get', '/api/categories', [
        buildCategoryListItem({
          id: 3,
          name: 'Rum',
          type: ' SPIRIT ',
          categoryType: spacedSpirit,
          _count: { bottles: 0 },
        }),
      ]);
      renderPage();
      await screen.findByText('Rum');
      const updated = captureRequest('put', '/api/categories/:id');

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

      expect(await updated.body).toMatchObject({ type: ' SPIRIT ' });
    });

    it('shows a type missing from the list as a custom type', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/categories', [
        buildCategoryListItem({
          name: 'Water',
          type: 'UNKNOWN',
          _count: { bottles: 0 },
        }),
      ]);
      renderPage();
      await screen.findByText('Water');

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(within(categoryDialog()).getByLabelText('Type')).toHaveValue('__OTHER__');
      expect(within(categoryDialog()).getByPlaceholderText('Custom type')).toHaveValue('UNKNOWN');
    });

    describe('types whose names HTML would hide', () => {
      async function openTypeOptions(user: User) {
        await renderLoadedPage();
        await user.click(screen.getByRole('button', { name: 'Add Category' }));
        const options = within(within(categoryDialog()).getByLabelText('Type')).getAllByRole(
          'option',
        );
        return options.map((option) => option.textContent);
      }

      it('tells a type with surrounding spaces from the type without them, and labels the empty name', async () => {
        const user = userEvent.setup();
        mockApiResponse('get', '/api/category-types', [unnamed, spacedSpirit, spirit]);

        expect(await openTypeOptions(user)).toEqual([
          '(no name)',
          SPACED_SPIRIT_LABEL,
          'SPIRIT',
          'Other...',
        ]);
      });

      it('adds the stored name to a translation that would hide it', async () => {
        const user = userEvent.setup();
        const nameTranslations = { en: 'Spirits' };
        mockApiResponse('get', '/api/category-types', [
          { ...unnamed, nameTranslations },
          { ...spacedSpirit, nameTranslations },
          { ...spirit, nameTranslations },
        ]);

        expect(await openTypeOptions(user)).toEqual([
          'Spirits – (no name)',
          `Spirits – ${SPACED_SPIRIT_LABEL}`,
          'Spirits',
          'Other...',
        ]);
      });

      it('tells a type with inner spaces or a tab from the type with one space', async () => {
        const user = userEvent.setup();
        mockApiResponse('get', '/api/category-types', [doubleSpaced, singleSpaced, tabbed]);

        expect(await openTypeOptions(user)).toEqual([
          DOUBLE_SPACED_LABEL,
          'X Y',
          'X␣Y (with spaces)',
          'Other...',
        ]);
        expect(
          within(categoryDialog()).getByRole('option', { name: DOUBLE_SPACED_LABEL }),
        ).toBeInTheDocument();
      });

      it('adds the stored name with inner spaces to a translation that would hide it', async () => {
        const user = userEvent.setup();
        const nameTranslations = { en: 'Mixers' };
        mockApiResponse('get', '/api/category-types', [
          { ...doubleSpaced, nameTranslations },
          { ...singleSpaced, nameTranslations },
        ]);

        expect(await openTypeOptions(user)).toEqual([
          `Mixers – ${DOUBLE_SPACED_LABEL}`,
          'Mixers',
          'Other...',
        ]);
      });

      it('tells a type with an invisible character from the type without it, also with the same translation', async () => {
        const user = userEvent.setup();
        const nameTranslations = { en: 'Mixers' };
        mockApiResponse('get', '/api/category-types', [
          zeroWidth,
          joined,
          { ...zeroWidth, name: 'Z\u200BW', nameTranslations },
          { ...joined, name: 'ZW', nameTranslations },
        ]);

        expect(await openTypeOptions(user)).toEqual([
          ZERO_WIDTH_LABEL,
          'XY',
          'Mixers – Z[U+200B]W (with invisible characters)',
          'Mixers',
          'Other...',
        ]);
        expect(
          within(categoryDialog()).getByRole('option', { name: ZERO_WIDTH_LABEL }),
        ).toBeInTheDocument();
      });

      it('tells a decomposed type from the composed one, also with the same translation', async () => {
        const user = userEvent.setup();
        const nameTranslations = { en: 'Creams' };
        mockApiResponse('get', '/api/category-types', [
          decomposed,
          composed,
          { ...decomposed, name: 'CRE\u0301ME', nameTranslations },
          { ...composed, name: 'CR\u00C9ME', nameTranslations },
        ]);

        expect(await openTypeOptions(user)).toEqual([
          DECOMPOSED_LABEL,
          'CR\u00C8ME',
          'Creams – CRE\u0301ME (non-standard Unicode form)',
          'Creams',
          'Other...',
        ]);
        expect(
          within(categoryDialog()).getByRole('option', { name: DECOMPOSED_LABEL }),
        ).toBeInTheDocument();
      });
    });

    describe('a category whose type has an empty name', () => {
      const water = buildCategoryListItem({
        id: 4,
        name: 'Water',
        type: '',
        categoryType: unnamed,
        _count: { bottles: 0 },
      });

      beforeEach(() => {
        mockApiResponse('get', '/api/category-types', [unnamed, spirit]);
        mockApiResponse('get', '/api/categories', [water]);
      });

      async function saveWater(user: User) {
        renderPage();
        await screen.findByText('Water');
        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));
      }

      it('is not saved: a message asks for a type with a name', async () => {
        const user = userEvent.setup();
        const updated = captureRequest('put', '/api/categories/:id');

        await saveWater(user);

        expect(updated.count()).toBe(0);
        const type = within(categoryDialog()).getByLabelText('Type');
        expect(type).toHaveValue('');
        expect(type).toHaveFocus();
        expect(type).toHaveAttribute('aria-invalid', 'true');
        expect(type).toHaveAccessibleDescription('Choose or enter a type with a name.');
      });

      it('is saved once another type is chosen', async () => {
        const user = userEvent.setup();
        const updated = captureRequest('put', '/api/categories/:id');
        await saveWater(user);

        await user.selectOptions(within(categoryDialog()).getByLabelText('Type'), 'SPIRIT');
        expect(
          within(categoryDialog()).queryByText('Choose or enter a type with a name.'),
        ).not.toBeInTheDocument();
        await user.click(within(categoryDialog()).getByRole('button', { name: 'Save' }));

        expect(await updated.body).toMatchObject({ type: 'SPIRIT' });
      });

      it('opens again without the message', async () => {
        const user = userEvent.setup();
        await saveWater(user);

        await user.click(within(categoryDialog()).getByRole('button', { name: 'Cancel' }));
        await user.click(screen.getByRole('button', { name: 'Edit' }));

        expect(
          within(categoryDialog()).queryByText('Choose or enter a type with a name.'),
        ).not.toBeInTheDocument();
      });

      it('has no accessibility violation with the message', async () => {
        const user = userEvent.setup();
        await saveWater(user);

        expect(await axe(categoryDialog())).toHaveNoViolations();
      });
    });

    it('collapses the translations block again when another category is opened', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Translations' }));
      expect(within(categoryDialog()).getByLabelText('Français')).toBeInTheDocument();
      await user.click(within(categoryDialog()).getByRole('button', { name: 'Cancel' }));

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);

      expect(within(categoryDialog()).getByDisplayValue('Grenadine')).toBeInTheDocument();
      expect(within(categoryDialog()).queryByLabelText('Français')).not.toBeInTheDocument();
    });
  });

  describe('category deletion', () => {
    async function deleteFirstCategory(user: User) {
      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
      const confirmation = screen.getByRole('alertdialog');
      expect(confirmation).toHaveAccessibleDescription('Delete this category?');
      await user.click(within(confirmation).getByRole('button', { name: 'Delete' }));
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

      expect(await screen.findByText('Category deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/categories/1');
      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([
        qk.categories,
        qk.categoryTypes,
        qk.bottles,
        qk.shortages,
        qk.availability,
      ]);
      await waitFor(() => expect(reloaded.count()).toBe(1));
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/categories/:id');

      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(deleted.count()).toBe(0);
    });

    it('lists the bottles a forced deletion of the category deletes with it', async () => {
      const user = userEvent.setup();
      const requests = mockItemInUse(
        '/api/categories/:id',
        {
          cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }],
          bottles: [
            { id: 7, name: 'Absolut' },
            { id: 8, name: 'Grey Goose' },
          ],
        },
        'This category still has bottles',
      );
      await renderLoadedPage();

      await deleteFirstCategory(user);

      const forced = await screen.findByRole('alertdialog', { name: 'Delete an item in use?' });
      const listed = within(forced)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
      expect(listed).toEqual(['Moscow Mule: 1 line removed', 'Absolut', 'Grey Goose']);
      await user.click(
        within(forced).getByRole('checkbox', {
          name: 'I understand that these recipes will be changed and these bottles deleted',
        }),
      );
      await user.click(within(forced).getByRole('button', { name: 'Delete anyway' }));

      expect(
        await screen.findByText('Category deleted: 2 bottles deleted, 1 cocktail changed.'),
      ).toBeInTheDocument();
      expect(requests.map((url) => url.search)).toEqual(['', '?force=true']);
    });

    it('keeps a category that still has bottles when the forced deletion is cancelled', async () => {
      const user = userEvent.setup();
      mockItemInUse(
        '/api/categories/:id',
        { cocktails: [], bottles: [{ id: 7, name: 'Absolut' }] },
        'This category still has bottles',
      );
      await renderLoadedPage();

      await deleteFirstCategory(user);
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('This category still has bottles'),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/Bottles in it: .+\./);
      expect(screen.getByText('Vodka')).toBeInTheDocument();
    });
  });

  describe('category types manager', () => {
    it('lists the types with the number of categories using them', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      expect(
        within(manager).getByText('GARNISH', { selector: 'span.font-medium' }),
      ).toBeInTheDocument();
      expect(within(manager).getByText('(0)')).toBeInTheDocument();
    });

    it('creates a type, upper-cased, and empties the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'mixer');
      await user.click(within(manager).getByRole('button', { name: 'Create' }));

      expect(await created.body).toEqual({ name: 'MIXER', nameTranslations: null, color: 'gray' });
      expect(await screen.findByText('Type created')).toBeInTheDocument();
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
    });

    it('does not create a type without a name', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), '  ');
      await user.click(within(manager).getByRole('button', { name: 'Create' }));

      expect(created.count()).toBe(0);
    });

    it.each([
      ['cre\u0300me', 'CR\u00C8ME'],
      ['\u0390', '\u03AA\u0301'],
    ])('creates the type %j composed after its upper case, as %j', async (typed, sent) => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), typed);
      await user.click(within(manager).getByRole('button', { name: 'Create' }));

      expect(await created.body).toMatchObject({ name: sent });
    });

    it('does not create a type whose name is only invisible or blank characters', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), '\u200B\u2800');
      await user.click(within(manager).getByRole('button', { name: 'Create' }));

      expect(created.count()).toBe(0);
    });

    it('edits a type: name locked, translations open, color and translations sent', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/category-types/:name');
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'Edit' })[0]!);
      expect(within(manager).getByText('Edit Type')).toBeInTheDocument();
      expect(within(manager).getByDisplayValue('SPIRIT')).toBeDisabled();
      await user.type(within(manager).getByLabelText('Français'), 'Spiritueux');
      await user.click(within(manager).getByRole('button', { name: 'Save' }));

      expect((await updated.url).pathname).toBe('/api/category-types/SPIRIT');
      expect(await updated.body).toEqual({
        nameTranslations: { fr: 'Spiritueux' },
        color: 'blue',
      });
      expect(await screen.findByText('Type updated')).toBeInTheDocument();
      expect(within(manager).getByText('Add Type')).toBeInTheDocument();
    });

    it('cancels the edition of a type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'Edit' })[0]!);
      await user.click(within(manager).getByRole('button', { name: 'Cancel' }));

      expect(within(manager).getByText('Add Type')).toBeInTheDocument();
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
      expect(within(manager).queryByLabelText('Français')).not.toBeInTheDocument();
    });

    it('sends the color picked for a new type', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/category-types');
      const manager = await openTypesManager(user);

      await user.type(within(manager).getByPlaceholderText('GARNISH, MIXER...'), 'bitter');
      await user.click(within(manager).getByRole('button', { name: 'Red' }));
      expect(within(manager).getByRole('button', { name: 'Red' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.click(within(manager).getByRole('button', { name: 'Create' }));

      expect(await created.body).toEqual({ name: 'BITTER', nameTranslations: null, color: 'red' });
    });

    it('deletes an unused type after confirmation', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/category-types/:name');
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'Delete' }));
      const confirmation = screen.getByRole('alertdialog');
      expect(confirmation).toHaveAccessibleDescription('Delete this type?');
      await user.click(within(confirmation).getByRole('button', { name: 'Delete' }));

      expect(await screen.findByText('Type deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/category-types/GARNISH');
    });

    it('empties the form when the type being edited is deleted', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'Edit' })[2]!);
      expect(within(manager).getByDisplayValue('GARNISH')).toBeDisabled();
      await user.click(within(manager).getByRole('button', { name: 'Delete' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      );

      await waitFor(() => expect(within(manager).getByText('Add Type')).toBeInTheDocument());
      expect(within(manager).getByPlaceholderText('GARNISH, MIXER...')).toHaveValue('');
    });

    it('keeps the form on the type being edited when another type is deleted', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getAllByRole('button', { name: 'Edit' })[0]!);
      await user.click(within(manager).getByRole('button', { name: 'Delete' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      );

      expect(await screen.findByText('Type deleted')).toBeInTheDocument();
      expect(within(manager).getByDisplayValue('SPIRIT')).toBeDisabled();
    });

    it('tells a type with surrounding spaces from the type without them, and labels the empty name', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [unnamed, spacedSpirit, spirit]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      const rows = within(manager)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
      expect(rows[0]).toContain('(no name)(no name)(0)');
      expect(rows[1]).toContain(`${SPACED_SPIRIT_LABEL}${SPACED_SPIRIT_LABEL}(1)`);
      expect(rows[2]).toContain('SPIRITSPIRIT(1)');
    });

    it('keeps the translation of a type with surrounding spaces next to its stored name', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [
        { ...spacedSpirit, nameTranslations: { en: 'Spirits' } },
      ]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      expect(within(manager).getByRole('listitem')).toHaveTextContent(
        `Spirits${SPACED_SPIRIT_LABEL}(1)`,
      );
    });

    it('tells a type with inner spaces from the type with one space', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [doubleSpaced, singleSpaced]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      const rows = within(manager)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
      expect(rows[0]).toContain(`${DOUBLE_SPACED_LABEL}${DOUBLE_SPACED_LABEL}(1)`);
      expect(rows[1]).toContain('X YX Y(0)');
    });

    it('tells a type with an invisible character from the type without it', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [zeroWidth, joined]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      const rows = within(manager)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
      expect(rows[0]).toContain(`${ZERO_WIDTH_LABEL}${ZERO_WIDTH_LABEL}(1)`);
      expect(rows[1]).toContain('XYXY(0)');
    });

    it('tells a decomposed type from the composed one', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [decomposed, composed]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      const rows = within(manager)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
      expect(rows[0]).toContain(`${DECOMPOSED_LABEL}${DECOMPOSED_LABEL}(1)`);
      expect(rows[1]).toContain('CR\u00C8MECR\u00C8ME(0)');
    });

    // The decision is about names: a translation is shown as the admin typed it
    it('marks a stored name with inner spaces but not a translation with inner spaces', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/category-types', [
        { ...doubleSpaced, nameTranslations: { en: 'Mixers' } },
        { ...singleSpaced, nameTranslations: { en: 'Fruit  juice' } },
      ]);
      await renderLoadedPage();

      const manager = await openTypesManager(user);

      const rows = within(manager)
        .getAllByRole('listitem')
        .map((row) => row.textContent);
      expect(rows[0]).toContain(`Mixers${DOUBLE_SPACED_LABEL}(1)`);
      expect(rows[1]).toContain('Fruit  juiceX Y(0)');
    });

    // Data older than v1.9.0 can hold a type with an empty name: it is named in the query.
    describe('the type with an empty name', () => {
      beforeEach(() => {
        mockApiResponse('get', '/api/category-types', [unnamed, spirit]);
      });

      it('is edited through the query', async () => {
        const user = userEvent.setup();
        await renderLoadedPage();
        const updated = captureRequest('put', '/api/category-types');
        const manager = await openTypesManager(user);

        await user.click(within(manager).getAllByRole('button', { name: 'Edit' })[0]!);
        await user.click(within(manager).getByRole('button', { name: 'Red' }));
        await user.click(within(manager).getByRole('button', { name: 'Save' }));

        const url = await updated.url;
        expect(url.pathname).toBe('/api/category-types');
        expect(url.searchParams.get('name')).toBe('');
        expect(await updated.body).toEqual({ nameTranslations: null, color: 'red' });
        expect(await screen.findByText('Type updated')).toBeInTheDocument();
      });

      it('is deleted through the query', async () => {
        const user = userEvent.setup();
        await renderLoadedPage();
        const deleted = captureRequest('delete', '/api/category-types');
        const manager = await openTypesManager(user);

        await user.click(within(manager).getByRole('button', { name: 'Delete' }));
        await user.click(
          within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
        );

        expect(await screen.findByText('Type deleted')).toBeInTheDocument();
        const url = await deleted.url;
        expect(url.pathname).toBe('/api/category-types');
        expect(url.searchParams.get('name')).toBe('');
      });
    });

    it('shows the backend message in a toast when a type cannot be deleted', async () => {
      const user = userEvent.setup();
      mockApiError(
        'delete',
        '/api/category-types/:name',
        409,
        'Cannot delete: categories still use this type',
      );
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'Delete' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
      );

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Cannot delete: categories still use this type',
        ),
      );
    });

    it('disables the deletion of a type used by categories', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      const usedTypeButtons = within(manager).getAllByRole('button', {
        name: 'This type is used by categories and cannot be deleted.',
      });
      expect(usedTypeButtons).toHaveLength(2);
      usedTypeButtons.forEach((button) => expect(button).toBeDisabled());
    });

    it('closes with its close button', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const manager = await openTypesManager(user);

      await user.click(within(manager).getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
