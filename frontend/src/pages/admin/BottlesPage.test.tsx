import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { qk } from '../../queries/keys';
import { useShortages } from '../../queries/shortages';
import { mockDownload } from '../../test/download';
import {
  buildBottle,
  buildCategoryListItem,
  buildCategoryType,
  buildShortage,
} from '../../test/factories';
import {
  captureRequest,
  mockApiError,
  mockApiPending,
  mockApiResponse,
  mockItemInUse,
  mockNetworkError,
} from '../../test/msw/utils';
import type { Bottle } from '../../types';
import BottlesPage from './BottlesPage';

// The wizard has its own tests: here it only has to report an import or a close.
vi.mock('../../components/import/ImportBottlesWizard', () => ({
  default: ({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onImported}>finish-import</button>
      <button onClick={onClose}>close-wizard</button>
    </div>
  ),
}));

const vodka = buildCategoryListItem({
  id: 1,
  name: 'Vodka',
  categoryType: buildCategoryType({ name: 'SPIRIT', color: 'blue' }),
  desiredStock: 2,
});
const gin = buildCategoryListItem({
  id: 2,
  name: 'Gin',
  categoryType: buildCategoryType({ name: 'SPIRIT', color: 'blue' }),
  desiredStock: 2,
});

const absolut = buildBottle({
  id: 1,
  name: 'Absolut',
  category: vodka,
  capacityMl: 700,
  remainingPercent: 80,
  purchasePrice: 25,
  alcoholPercentage: 40,
  location: 'Bar',
});
const hendricks = buildBottle({
  id: 2,
  name: 'Hendricks',
  category: gin,
  capacityMl: 500,
  remainingPercent: 20,
  openedAt: '2024-06-01T00:00:00.000Z',
  purchasePrice: null,
  alcoholPercentage: 41.4,
  location: null,
  isApero: true,
});
const emptyBottle = buildBottle({ ...absolut, id: 9, name: 'Finished rum', remainingPercent: 0 });

function mockBottles(bottles: Bottle[]) {
  mockApiResponse('get', '/api/bottles', bottles);
}

type User = ReturnType<typeof userEvent.setup>;

function renderPage() {
  return renderWithFeedback(<BottlesPage />);
}

async function renderLoadedPage() {
  renderPage();
  await screen.findByText('Absolut');
}

function dialog() {
  return screen.getByRole('dialog');
}

async function openCreateForm(user: User) {
  await user.click(screen.getByRole('button', { name: 'Add Bottle' }));
}

function nameInput() {
  return within(dialog()).getByLabelText(/Name \(brand\)/);
}

async function confirmDeletion(user: User, index = 0) {
  await user.click(screen.getAllByRole('button', { name: 'Delete' })[index]!);
  const confirmation = screen.getByRole('alertdialog');
  expect(confirmation).toHaveAccessibleDescription('Delete this bottle?');
  await user.click(within(confirmation).getByRole('button', { name: 'Delete' }));
}

/** Reads the shortages like the sidebar badge of AdminLayout does. */
function ShortagesBadge() {
  const { data } = useShortages();
  return <span data-testid="shortages-badge">{data?.length ?? '-'}</span>;
}

beforeEach(() => {
  mockBottles([absolut, hendricks]);
  mockApiResponse('get', '/api/categories', [vodka, gin]);
});

afterEach(() => {
  clearToasts();
  vi.restoreAllMocks();
});

describe('BottlesPage', () => {
  describe('list', () => {
    it('lists the available bottles with their details', async () => {
      await renderLoadedPage();
      expect(screen.getByRole('heading', { level: 1, name: 'Bottles' })).toBeInTheDocument();
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('700 ml')).toBeInTheDocument();
      expect(screen.getByText('€25.00')).toBeInTheDocument();
      expect(screen.getByText('40% vol.')).toBeInTheDocument();
      expect(screen.getByText('Opened')).toBeInTheDocument();
      expect(screen.getByText('Sealed')).toBeInTheDocument();
      expect(screen.getByText('Available bottles (2)')).toBeInTheDocument();
    });

    it('colors the fill level: success above 50 %, danger at 20 % or less', async () => {
      await renderLoadedPage();
      expect(document.querySelector('.bg-success')).not.toBeNull();
      expect(document.querySelector('.bg-warning')).toBeNull();
      expect(document.querySelector('.bg-danger')).not.toBeNull();
    });

    it('never shows "no results" while the bottles are loading', () => {
      mockApiPending('get', '/api/bottles');
      renderPage();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByText('No results')).not.toBeInTheDocument();
    });

    it('shows "no results" once loaded without bottles', async () => {
      mockBottles([]);
      renderPage();
      expect(await screen.findByText('No results')).toBeInTheDocument();
    });

    it('shows a load error with a retry button', async () => {
      const user = userEvent.setup();
      mockNetworkError('get', '/api/bottles');
      renderPage();
      const retry = await screen.findByRole('button', { name: 'Retry' });

      mockBottles([absolut, hendricks]);
      await user.click(retry);

      expect(await screen.findByText('Absolut')).toBeInTheDocument();
    });

    it('filters by name and by location', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.type(screen.getByPlaceholderText('Search...'), 'abs');
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('Search...'));

      await user.type(screen.getByRole('combobox', { name: 'Filter by location' }), 'bar');
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
    });

    it('suggests the known locations and filters on the one picked', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const location = screen.getByRole('combobox', { name: 'Filter by location' });

      await user.type(location, 'b');
      await user.click(screen.getByRole('option', { name: 'Bar' }));

      expect(location).toHaveValue('Bar');
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
    });

    it('filters by a typed category name', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.type(screen.getByPlaceholderText('Filter by category'), 'gin');

      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.queryByText('Absolut')).not.toBeInTheDocument();
    });

    it('sorts the category column on the localized name', async () => {
      const user = userEvent.setup();
      mockBottles([
        {
          ...absolut,
          category: { ...vodka, name: 'A-vodka', nameTranslations: { en: 'Zubrowka' } },
        },
        { ...hendricks, category: { ...gin, name: 'Z-gin', nameTranslations: { en: 'Gin' } } },
      ]);
      renderPage();
      await screen.findByText('Absolut');

      await user.click(screen.getByText('Category'));

      const names = screen.getAllByText(/Absolut|Hendricks/).map((cell) => cell.textContent);
      expect(names).toEqual(['Hendricks', 'Absolut']);
    });

    it('groups identical bottles and lists them when the group is opened', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockBottles([absolut, { ...absolut, id: 3, remainingPercent: 40 }, hendricks]);
      try {
        renderPage();

        await user.click(await screen.findByText('×2'));

        expect(screen.getAllByText('Absolut')).toHaveLength(3);
        expect(screen.getByText('~60%')).toBeInTheDocument();
        const keyWarnings = consoleError.mock.calls.filter((args) =>
          args.some((arg) => typeof arg === 'string' && arg.includes('unique "key"')),
        );
        expect(keyWarnings).toHaveLength(0);
      } finally {
        consoleError.mockRestore();
      }
    });

    it('opens a group from the keyboard with a button that reports its state', async () => {
      const user = userEvent.setup();
      mockBottles([absolut, { ...absolut, id: 3 }, hendricks]);
      renderPage();
      const toggle = await screen.findByRole('button', { name: /×2/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      toggle.focus();
      await user.keyboard('{Enter}');

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByText('Absolut')).toHaveLength(3);
    });

    it('keeps a group open after a page change and back', async () => {
      const user = userEvent.setup();
      const singles = Array.from({ length: 25 }, (_, index) => ({
        ...hendricks,
        id: 100 + index,
        name: `Bottle ${index + 1}`,
      }));
      const group = [
        { ...absolut, id: 1 },
        { ...absolut, id: 2 },
      ];
      mockBottles([...singles, ...group]);
      renderPage();
      await screen.findByText('Bottle 1');

      await user.click(screen.getByText('2', { selector: 'nav button' }));
      await user.click(screen.getByText('×2'));
      expect(screen.getAllByText('Absolut')).toHaveLength(3);
      await user.click(screen.getByText('1', { selector: 'nav button' }));
      await user.click(screen.getByText('2', { selector: 'nav button' }));

      expect(screen.getAllByText('Absolut')).toHaveLength(3);
    });

    it('keeps a group open after a search hides it and shows it again', async () => {
      const user = userEvent.setup();
      mockBottles([absolut, { ...absolut, id: 3 }, hendricks]);
      renderPage();
      await user.click(await screen.findByText('×2'));

      await user.type(screen.getByPlaceholderText('Search...'), 'hend');
      expect(screen.queryByText('Absolut')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('Search...'));

      expect(screen.getAllByText('Absolut')).toHaveLength(3);
    });

    it('closes an open group on a second click', async () => {
      const user = userEvent.setup();
      mockBottles([absolut, { ...absolut, id: 3 }]);
      renderPage();
      await user.click(await screen.findByText('×2'));
      expect(screen.getAllByText('Absolut')).toHaveLength(3);

      await user.click(screen.getByText('×2'));

      expect(screen.getAllByText('Absolut')).toHaveLength(1);
    });

    it('keeps the empty bottles in a collapsed history', async () => {
      const user = userEvent.setup();
      mockBottles([absolut, hendricks, emptyBottle]);
      await renderLoadedPage();
      expect(screen.queryByText('Finished rum')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /History \(empty\) \(1\)/ }));

      expect(screen.getByText('Finished rum')).toBeInTheDocument();
      expect(screen.getByText('Available bottles (2)')).toBeInTheDocument();
    });
  });

  describe('form', () => {
    it('disables the add button while no category is loaded', async () => {
      mockApiResponse('get', '/api/categories', []);
      await renderLoadedPage();

      const addButton = screen.getByRole('button', { name: 'Add Bottle' });
      expect(addButton).toBeDisabled();
      expect(addButton).toHaveAttribute('title', 'Create a category first to add bottles');
    });

    it('creates a bottle in the first category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByLabelText('Can be served as an aperitif'));
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toEqual({
        name: 'New Whisky',
        categoryId: 1,
        purchasePrice: null,
        capacityMl: 700,
        remainingPercent: 100,
        openedAt: null,
        alcoholPercentage: null,
        location: null,
        isApero: true,
        isDigestif: false,
        quantity: 1,
      });
      expect(await screen.findByText('Bottle created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends every field of the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);
      const form = within(dialog());

      await user.type(nameInput(), 'Tanqueray');
      await user.selectOptions(form.getByLabelText('Category'), '2');
      fireEvent.change(form.getByLabelText('Capacity (ml)'), { target: { value: '1000' } });
      await user.type(form.getByLabelText('Purchase Price'), '32.5');
      fireEvent.change(form.getByLabelText(/Remaining \(%\)/), { target: { value: '60' } });
      await user.type(form.getByLabelText('Opened On'), '10/01/2026');
      await user.type(form.getByLabelText('Alcohol (% vol.)'), '43.1');
      await user.type(form.getByLabelText('Location'), 'Shelf');
      await user.click(form.getByLabelText('Can be served as a digestif'));
      await user.click(form.getByRole('button', { name: 'Save' }));

      expect(await created.body).toEqual({
        name: 'Tanqueray',
        categoryId: 2,
        purchasePrice: 32.5,
        capacityMl: 1000,
        remainingPercent: 60,
        openedAt: '2026-10-01',
        alcoholPercentage: 43.1,
        location: 'Shelf',
        isApero: false,
        isDigestif: true,
        quantity: 1,
      });
    });

    it('creates several identical bottles at once', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'Rum');
      // An emptied field snaps back to 1, so set the value in one go.
      fireEvent.change(within(dialog()).getByLabelText('Quantity'), { target: { value: '3' } });
      expect(within(dialog()).getByText('3 identical bottles will be created')).toBeInTheDocument();
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

      expect(await created.body).toMatchObject({ name: 'Rum', quantity: 3 });
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiPending('post', '/api/bottles');
      const created = captureRequest('post', '/api/bottles');
      await renderLoadedPage();
      await openCreateForm(user);
      await user.type(nameInput(), 'Rum');
      const save = within(dialog()).getByRole('button', { name: 'Save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      expect(created.count()).toBe(1);
    });

    it('does not submit "save and duplicate" when the name is empty', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.click(within(dialog()).getByRole('button', { name: 'Save and duplicate' }));

      expect(created.count()).toBe(0);
      expect((nameInput() as HTMLInputElement).validity.valueMissing).toBe(true);
    });

    it('creates the bottle and keeps the form open on "save and duplicate"', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByRole('button', { name: 'Save and duplicate' }));

      expect(await created.body).toMatchObject({ name: 'New Whisky', categoryId: 1 });
      expect(await screen.findByText('Bottle created')).toBeInTheDocument();
      expect(within(dialog()).getByDisplayValue('New Whisky')).toBeInTheDocument();

      // The intent is reset: a plain save afterwards closes the form.
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(created.count()).toBe(2);
    });

    it('pressing Enter in the name field saves and closes the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky{Enter}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(created.count()).toBe(1);
    });

    it('opens the edit form filled with the bottle', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);

      expect(screen.getByText('Edit Bottle')).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Hendricks');
      expect(within(dialog()).getByLabelText('Opened On')).toHaveValue('06/01/2024');
      expect(within(dialog()).getByLabelText('Can be served as an aperitif')).toBeChecked();
      expect(within(dialog()).getByLabelText('Can be served as a digestif')).not.toBeChecked();
      expect(
        within(dialog()).queryByRole('button', { name: 'Save and duplicate' }),
      ).not.toBeInTheDocument();
    });

    it('updates a bottle without a quantity and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/bottles/:id');
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);

      await user.clear(nameInput());
      await user.type(nameInput(), 'Absolut Elyx');
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

      expect((await updated.url).pathname).toBe('/api/bottles/1');
      const body = await updated.body;
      expect(body).toMatchObject({
        name: 'Absolut Elyx',
        purchasePrice: 25,
        alcoholPercentage: 40,
        location: 'Bar',
      });
      expect(body).not.toHaveProperty('quantity');
      expect(await screen.findByText('Bottle updated')).toBeInTheDocument();
    });

    it('refreshes the shortages badge after a bottle is updated, without leaving the page', async () => {
      const user = userEvent.setup();
      renderWithFeedback(
        <>
          <BottlesPage />
          <ShortagesBadge />
        </>,
      );
      await screen.findByText('Absolut');
      await waitFor(() => expect(screen.getByTestId('shortages-badge')).toHaveTextContent('0'));
      mockApiResponse('get', '/api/shortages', [buildShortage({ category: { id: 1 } })]);
      const shortagesReloaded = captureRequest('get', '/api/shortages');

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
      await user.click(within(dialog()).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.getByTestId('shortages-badge')).toHaveTextContent('1'));
      expect(shortagesReloaded.count()).toBe(1);
    });
  });

  describe('deletion', () => {
    it('deletes a bottle after confirmation and refreshes everything that shows bottles', async () => {
      const user = userEvent.setup();
      const queryClient = createTestQueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      renderWithFeedback(<BottlesPage />, { queryClient });
      await screen.findByText('Absolut');
      const deleted = captureRequest('delete', '/api/bottles/:id');

      await confirmDeletion(user);

      expect(await screen.findByText('Bottle deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/bottles/1');
      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([
        qk.bottles,
        qk.shortages,
        qk.categories,
        qk.menus,
        qk.availability,
      ]);
    });

    it('deletes an empty bottle from the history', async () => {
      const user = userEvent.setup();
      mockBottles([emptyBottle]);
      const deleted = captureRequest('delete', '/api/bottles/:id');
      renderPage();
      await user.click(await screen.findByRole('button', { name: /History \(empty\)/ }));

      await confirmDeletion(user);

      expect((await deleted.url).pathname).toBe('/api/bottles/9');
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/bottles/:id');

      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(deleted.count()).toBe(0);
    });

    it('lists the cocktails of a bottle in use and deletes it anyway once the risks are accepted', async () => {
      const user = userEvent.setup();
      const requests = mockItemInUse('/api/bottles/:id', {
        cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }],
        bottles: [],
      });
      await renderLoadedPage();
      const reloaded = captureRequest('get', '/api/bottles');

      await confirmDeletion(user);

      const forced = await screen.findByRole('alertdialog', { name: 'Delete an item in use?' });
      expect(forced).toHaveTextContent('Moscow Mule: 1 line removed');
      const deleteAnyway = within(forced).getByRole('button', { name: 'Delete anyway' });
      expect(deleteAnyway).toBeDisabled();
      await user.click(
        within(forced).getByRole('checkbox', {
          name: 'I understand that these recipes will be changed',
        }),
      );
      await user.click(deleteAnyway);

      expect(await screen.findByText('Bottle deleted: 1 cocktail changed.')).toBeInTheDocument();
      expect(requests.map((url) => `${url.pathname}${url.search}`)).toEqual([
        '/api/bottles/1',
        '/api/bottles/1?force=true',
      ]);
      await waitFor(() => expect(reloaded.count()).toBe(1));
    });

    it('keeps a bottle in use when the forced deletion is cancelled', async () => {
      const user = userEvent.setup();
      const requests = mockItemInUse(
        '/api/bottles/:id',
        {
          cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }],
          bottles: [],
        },
        'This bottle is used by cocktails',
      );
      await renderLoadedPage();

      await confirmDeletion(user);
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('This bottle is used by cocktails'),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/Used by these cocktails: .+\./);
      expect(requests).toHaveLength(1);
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
  });

  describe('import and export', () => {
    it('opens and closes the import wizard', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'Import' }));
      expect(screen.getByTestId('import-wizard')).toBeInTheDocument();
      await user.click(screen.getByText('close-wizard'));

      expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();
    });

    it('refreshes the bottles, categories and category types after an import', async () => {
      const user = userEvent.setup();
      const queryClient = createTestQueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      renderWithFeedback(<BottlesPage />, { queryClient });
      await screen.findByText('Absolut');
      const reloaded = captureRequest('get', '/api/bottles');

      await user.click(screen.getByRole('button', { name: 'Import' }));
      await user.click(screen.getByText('finish-import'));

      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([
        qk.bottles,
        qk.shortages,
        qk.categories,
        qk.menus,
        qk.availability,
        qk.categoryTypes,
      ]);
      await waitFor(() => expect(reloaded.count()).toBe(1));
    });

    it('exports the filtered bottles in the chosen format', async () => {
      const user = userEvent.setup();
      const downloads = mockDownload();
      await renderLoadedPage();
      const exported = captureRequest('get', '/api/bottles/export');
      await user.type(screen.getByPlaceholderText('Search...'), 'abs');

      await user.click(screen.getByRole('button', { name: 'Export' }));
      await user.click(screen.getByText('Export (CSV)'));

      const query = (await exported.url).searchParams;
      expect(Object.fromEntries(query)).toEqual({ format: 'csv', search: 'abs' });
      // Saved under the name sent by the server (Content-Disposition)
      await waitFor(() => expect(downloads).toEqual(['bottles.csv']));
      expect(screen.queryByText('Export (JSON)')).not.toBeInTheDocument();
    });

    it('exports in JSON', async () => {
      const user = userEvent.setup();
      const downloads = mockDownload();
      await renderLoadedPage();
      const exported = captureRequest('get', '/api/bottles/export');

      await user.click(screen.getByRole('button', { name: 'Export' }));
      await user.click(screen.getByText('Export (JSON)'));

      expect((await exported.url).searchParams.get('format')).toBe('json');
      await waitFor(() => expect(downloads).toHaveLength(1));
      // The menu closes: its button takes the focus back.
      expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
    });

    it('closes the export menu on a click outside', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'Export' }));
      expect(screen.getByText('Export (JSON)')).toBeInTheDocument();
      await user.click(screen.getByText('Bottles'));

      expect(screen.queryByText('Export (JSON)')).not.toBeInTheDocument();
    });

    it('closes the export menu on Escape and gives the focus back to its button', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const exportButton = screen.getByRole('button', { name: 'Export' });

      await user.click(exportButton);
      expect(exportButton).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard('{Escape}');

      expect(screen.queryByText('Export (JSON)')).not.toBeInTheDocument();
      expect(exportButton).toHaveAttribute('aria-expanded', 'false');
      expect(exportButton).toHaveFocus();
    });

    it('names its filter fields and announces the number of bottles once filtered', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const search = screen.getByRole('searchbox', { name: 'Search bottles' });
      expect(screen.getByRole('combobox', { name: 'Filter by category' })).toBeInTheDocument();

      await user.type(search, 'abs');

      expect(await screen.findByText(/^\d+ results?$/)).toHaveAttribute('aria-live', 'polite');
    });

    it('shows an export failure in an error toast', async () => {
      const user = userEvent.setup();
      mockApiError('get', '/api/bottles/export', 500, 'Export failed');
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'Export' }));
      await user.click(screen.getByText('Export (JSON)'));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Export failed'));
    });
  });
});
