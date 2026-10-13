import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { qk } from '../../queries/keys';
import { useShortages } from '../../queries/shortages';
import { buildBottle, buildCategory, buildShortage } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import type { Bottle } from '../../types';
import BottlesPage from './BottlesPage';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

// The wizard has its own tests: here it only has to report an import or a close.
vi.mock('../../components/import/ImportBottlesWizard', () => ({
  default: ({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onImported}>finish-import</button>
      <button onClick={onClose}>close-wizard</button>
    </div>
  ),
}));

const vodka = buildCategory({ id: 1, name: 'Vodka', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 });
const gin = buildCategory({ id: 2, name: 'Gin', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 });

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
  await user.click(screen.getByRole('button', { name: 'bottles.add' }));
}

function nameInput() {
  return within(dialog()).getByLabelText(/bottles\.name/);
}

async function confirmDeletion(user: User, index = 0) {
  await user.click(screen.getAllByRole('button', { name: 'common.delete' })[index]);
  const confirmation = screen.getByRole('alertdialog');
  expect(confirmation).toHaveAccessibleDescription('bottles.confirmDelete');
  await user.click(within(confirmation).getByRole('button', { name: 'common.delete' }));
}

/**
 * The export saves the file through a temporary link: jsdom cannot download, so the
 * link click is recorded instead. Returns the spy on that click.
 */
function mockDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bottles');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
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
      expect(screen.getByRole('heading', { level: 1, name: 'bottles.title' })).toBeInTheDocument();
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('units.ml(700)')).toBeInTheDocument();
      expect(screen.getByText('€25.00')).toBeInTheDocument();
      expect(screen.getByText('units.abv(40)')).toBeInTheDocument();
      expect(screen.getByText('bottles.opened')).toBeInTheDocument();
      expect(screen.getByText('bottles.unopened')).toBeInTheDocument();
      expect(screen.getByText('bottles.activeTitle (2)')).toBeInTheDocument();
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
      expect(screen.getByText('common.loading')).toBeInTheDocument();
      expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
    });

    it('shows "no results" once loaded without bottles', async () => {
      mockBottles([]);
      renderPage();
      expect(await screen.findByText('common.noResults')).toBeInTheDocument();
    });

    it('shows a load error with a retry button', async () => {
      const user = userEvent.setup();
      mockNetworkError('get', '/api/bottles');
      renderPage();
      const retry = await screen.findByRole('button', { name: 'common.retry' });

      mockBottles([absolut, hendricks]);
      await user.click(retry);

      expect(await screen.findByText('Absolut')).toBeInTheDocument();
    });

    it('filters by name and by location', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.type(screen.getByPlaceholderText('common.search'), 'abs');
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('common.search'));

      await user.type(screen.getByRole('combobox', { name: 'bottles.filterByLocation' }), 'bar');
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
    });

    it('suggests the known locations and filters on the one picked', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const location = screen.getByRole('combobox', { name: 'bottles.filterByLocation' });

      await user.type(location, 'b');
      await user.click(screen.getByRole('option', { name: 'Bar' }));

      expect(location).toHaveValue('Bar');
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
    });

    it('filters by a typed category name', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.type(screen.getByPlaceholderText('bottles.filterByCategory'), 'gin');

      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.queryByText('Absolut')).not.toBeInTheDocument();
    });

    it('sorts the category column on the localized name', async () => {
      const user = userEvent.setup();
      mockBottles([
        { ...absolut, category: { ...vodka, name: 'A-vodka', nameTranslations: { en: 'Zubrowka' } } },
        { ...hendricks, category: { ...gin, name: 'Z-gin', nameTranslations: { en: 'Gin' } } },
      ]);
      renderPage();
      await screen.findByText('Absolut');

      await user.click(screen.getByText('bottles.category'));

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
          args.some((arg) => typeof arg === 'string' && arg.includes('unique "key"')));
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
      const singles = Array.from({ length: 25 }, (_, index) => ({ ...hendricks, id: 100 + index, name: `Bottle ${index + 1}` }));
      const group = [{ ...absolut, id: 1 }, { ...absolut, id: 2 }];
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

      await user.type(screen.getByPlaceholderText('common.search'), 'hend');
      expect(screen.queryByText('Absolut')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('common.search'));

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

      await user.click(screen.getByRole('button', { name: /bottles\.historyTitle \(1\)/ }));

      expect(screen.getByText('Finished rum')).toBeInTheDocument();
      expect(screen.getByText('bottles.activeTitle (2)')).toBeInTheDocument();
    });
  });

  describe('form', () => {
    it('disables the add button while no category is loaded', async () => {
      mockApiResponse('get', '/api/categories', []);
      await renderLoadedPage();

      const addButton = screen.getByRole('button', { name: 'bottles.add' });
      expect(addButton).toBeDisabled();
      expect(addButton).toHaveAttribute('title', 'bottles.noCategoryHint');
    });

    it('creates a bottle in the first category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByLabelText('bottles.usableAsApero'));
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

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
      expect(await screen.findByText('bottles.created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends every field of the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);
      const form = within(dialog());

      await user.type(nameInput(), 'Tanqueray');
      await user.selectOptions(form.getByLabelText('bottles.category'), '2');
      fireEvent.change(form.getByLabelText('bottles.capacityMl'), { target: { value: '1000' } });
      await user.type(form.getByLabelText('bottles.purchasePrice'), '32.5');
      fireEvent.change(form.getByLabelText(/bottles\.remainingPercent/), { target: { value: '60' } });
      fireEvent.change(form.getByLabelText('bottles.openedAt'), { target: { value: '2026-10-01' } });
      await user.type(form.getByLabelText('bottles.alcoholPercentage'), '43.1');
      await user.type(form.getByLabelText('bottles.location'), 'Shelf');
      await user.click(form.getByLabelText('bottles.usableAsDigestif'));
      await user.click(form.getByRole('button', { name: 'common.save' }));

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
      fireEvent.change(within(dialog()).getByLabelText('bottles.quantity'), { target: { value: '3' } });
      expect(within(dialog()).getByText('bottles.quantityHint(3)')).toBeInTheDocument();
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      expect(await created.body).toMatchObject({ name: 'Rum', quantity: 3 });
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiPending('post', '/api/bottles');
      const created = captureRequest('post', '/api/bottles');
      await renderLoadedPage();
      await openCreateForm(user);
      await user.type(nameInput(), 'Rum');
      const save = within(dialog()).getByRole('button', { name: 'common.save' });

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

      await user.click(within(dialog()).getByRole('button', { name: 'bottles.saveDuplicate' }));

      expect(created.count()).toBe(0);
      expect((nameInput() as HTMLInputElement).validity.valueMissing).toBe(true);
    });

    it('creates the bottle and keeps the form open on "save and duplicate"', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const created = captureRequest('post', '/api/bottles');
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByRole('button', { name: 'bottles.saveDuplicate' }));

      expect(await created.body).toMatchObject({ name: 'New Whisky', categoryId: 1 });
      expect(await screen.findByText('bottles.created')).toBeInTheDocument();
      expect(within(dialog()).getByDisplayValue('New Whisky')).toBeInTheDocument();

      // The intent is reset: a plain save afterwards closes the form.
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));
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

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

      expect(screen.getByText('bottles.edit')).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Hendricks');
      expect(within(dialog()).getByLabelText('bottles.openedAt')).toHaveValue('2024-06-01');
      expect(within(dialog()).getByLabelText('bottles.usableAsApero')).toBeChecked();
      expect(within(dialog()).getByLabelText('bottles.usableAsDigestif')).not.toBeChecked();
      expect(within(dialog()).queryByRole('button', { name: 'bottles.saveDuplicate' })).not.toBeInTheDocument();
    });

    it('updates a bottle without a quantity and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const updated = captureRequest('put', '/api/bottles/:id');
      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

      await user.clear(nameInput());
      await user.type(nameInput(), 'Absolut Elyx');
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      expect((await updated.url).pathname).toBe('/api/bottles/1');
      const body = await updated.body;
      expect(body).toMatchObject({
        name: 'Absolut Elyx',
        purchasePrice: 25,
        alcoholPercentage: 40,
        location: 'Bar',
      });
      expect(body).not.toHaveProperty('quantity');
      expect(await screen.findByText('bottles.updated')).toBeInTheDocument();
    });

    it('refreshes the shortages badge after a bottle is updated, without leaving the page', async () => {
      const user = userEvent.setup();
      renderWithFeedback(<><BottlesPage /><ShortagesBadge /></>);
      await screen.findByText('Absolut');
      await waitFor(() => expect(screen.getByTestId('shortages-badge')).toHaveTextContent('0'));
      mockApiResponse('get', '/api/shortages', [buildShortage({ category: { id: 1 } })]);
      const shortagesReloaded = captureRequest('get', '/api/shortages');

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(screen.getByTestId('shortages-badge')).toHaveTextContent('1'));
      expect(shortagesReloaded.count()).toBe(1);
    });
  });

  describe('deletion', () => {
    it('deletes a bottle after confirmation and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/bottles/:id');

      await confirmDeletion(user);

      expect(await screen.findByText('bottles.deleted')).toBeInTheDocument();
      expect((await deleted.url).pathname).toBe('/api/bottles/1');
    });

    it('deletes an empty bottle from the history', async () => {
      const user = userEvent.setup();
      mockBottles([emptyBottle]);
      const deleted = captureRequest('delete', '/api/bottles/:id');
      renderPage();
      await user.click(await screen.findByRole('button', { name: /bottles\.historyTitle/ }));

      await confirmDeletion(user);

      expect((await deleted.url).pathname).toBe('/api/bottles/9');
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const deleted = captureRequest('delete', '/api/bottles/:id');

      await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(deleted.count()).toBe(0);
    });

    it('shows the backend message and the cocktails of a bottle in use', async () => {
      const user = userEvent.setup();
      mockApiResponse('delete', '/api/bottles/:id', {
        error: 'This bottle is used by cocktails',
        details: { cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }], bottles: [] },
      }, 409);
      await renderLoadedPage();

      await confirmDeletion(user);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This bottle is used by cocktails'));
      expect(screen.getByRole('alert')).toHaveTextContent('deletion.usedByCocktails');
    });
  });

  describe('import and export', () => {
    it('opens and closes the import wizard', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.import' }));
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

      await user.click(screen.getByRole('button', { name: 'bottles.import' }));
      await user.click(screen.getByText('finish-import'));

      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([qk.bottles, qk.shortages, qk.categories, qk.menus, qk.availability, qk.categoryTypes]);
      await waitFor(() => expect(reloaded.count()).toBe(1));
    });

    it('exports the filtered bottles in the chosen format', async () => {
      const user = userEvent.setup();
      const download = mockDownload();
      await renderLoadedPage();
      const exported = captureRequest('get', '/api/bottles/export');
      await user.type(screen.getByPlaceholderText('common.search'), 'abs');

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportCsv'));

      const query = (await exported.url).searchParams;
      expect(Object.fromEntries(query)).toEqual({ format: 'csv', search: 'abs' });
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('bottles.exportJson')).not.toBeInTheDocument();
    });

    it('exports in JSON', async () => {
      const user = userEvent.setup();
      const download = mockDownload();
      await renderLoadedPage();
      const exported = captureRequest('get', '/api/bottles/export');

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportJson'));

      expect((await exported.url).searchParams.get('format')).toBe('json');
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      // The menu closes: its button takes the focus back.
      expect(screen.getByRole('button', { name: 'bottles.export' })).toHaveFocus();
    });

    it('closes the export menu on a click outside', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      expect(screen.getByText('bottles.exportJson')).toBeInTheDocument();
      await user.click(screen.getByText('bottles.title'));

      expect(screen.queryByText('bottles.exportJson')).not.toBeInTheDocument();
    });

    it('closes the export menu on Escape and gives the focus back to its button', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const exportButton = screen.getByRole('button', { name: 'bottles.export' });

      await user.click(exportButton);
      expect(exportButton).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard('{Escape}');

      expect(screen.queryByText('bottles.exportJson')).not.toBeInTheDocument();
      expect(exportButton).toHaveAttribute('aria-expanded', 'false');
      expect(exportButton).toHaveFocus();
    });

    it('names its filter fields and announces the number of bottles once filtered', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const search = screen.getByRole('searchbox', { name: 'bottles.search' });
      expect(screen.getByRole('combobox', { name: 'bottles.filterByCategory' })).toBeInTheDocument();

      await user.type(search, 'abs');

      expect(await screen.findByText(/^common\.resultCount\(/)).toHaveAttribute('aria-live', 'polite');
    });

    it('shows an export failure in an error toast', async () => {
      const user = userEvent.setup();
      mockApiError('get', '/api/bottles/export', 500, 'Export failed');
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportJson'));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Export failed'));
    });
  });
});
