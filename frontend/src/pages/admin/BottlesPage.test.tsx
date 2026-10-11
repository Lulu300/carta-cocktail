import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, fireEvent, screen, waitFor, within } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import { qk } from '../../queries/keys';
import { useShortages } from '../../queries/shortages';
import BottlesPage from './BottlesPage';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ApiError: actual.ApiError,
    bottles: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      exportFile: vi.fn(),
      importPreview: vi.fn(),
      importConfirm: vi.fn(),
    },
    categories: { list: vi.fn() },
    categoryTypes: { list: vi.fn().mockResolvedValue([]) },
    shortages: { list: vi.fn() },
  };
});

vi.mock('../../components/import/ImportBottlesWizard', () => ({
  default: ({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onImported}>finish-import</button>
      <button onClick={onClose}>close-wizard</button>
    </div>
  ),
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string; nameTranslations?: Record<string, string> | null }) =>
    entity.nameTranslations?.en ?? entity.name,
}));

// Kept until E-13 replaces the component mocks.
vi.mock('../../components/ui/MultiSelectDropdown', () => ({
  default: ({ placeholder }: { onChange: (v: string[]) => void; placeholder: string }) => (
    <div data-testid="multi-select">{placeholder}</div>
  ),
}));

vi.mock('../../components/ui/LocationAutocomplete', () => ({
  default: ({ onChange, placeholder }: { onChange: (v: string) => void; placeholder: string }) => (
    <input data-testid="location-autocomplete" placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ApiError, bottles as api, categories as categoriesApi, shortages as shortagesApi } from '../../services/api';

const mockApiList = vi.mocked(api.list);
const mockApiCreate = vi.mocked(api.create);
const mockApiUpdate = vi.mocked(api.update);
const mockApiDelete = vi.mocked(api.delete);
const mockExport = vi.mocked(api.exportFile);
const mockCatList = vi.mocked(categoriesApi.list);
const mockShortagesList = vi.mocked(shortagesApi.list);

const mockBottles = [
  {
    id: 1,
    name: 'Absolut',
    categoryId: 1,
    category: { id: 1, name: 'Vodka', type: 'SPIRIT' },
    capacityMl: 700,
    remainingPercent: 80,
    openedAt: null,
    purchasePrice: 25,
    alcoholPercentage: 40,
    location: 'Bar',
    isApero: false,
    isDigestif: false,
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    name: 'Hendricks',
    categoryId: 2,
    category: { id: 2, name: 'Gin', type: 'SPIRIT' },
    capacityMl: 500,
    remainingPercent: 20,
    openedAt: '2024-06-01T00:00:00.000Z',
    purchasePrice: null,
    alcoholPercentage: 41.4,
    location: null,
    isApero: true,
    isDigestif: false,
    createdAt: '2024-01-01',
  },
];

const emptyBottle = { ...mockBottles[0], id: 9, name: 'Finished rum', remainingPercent: 0 };

const mockCategories = [
  { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 },
  { id: 2, name: 'Gin', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 },
];

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

/** Reads the shortages like the sidebar badge of AdminLayout does. */
function ShortagesBadge() {
  const { data } = useShortages();
  return <span data-testid="shortages-badge">{data?.length ?? '-'}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiList.mockResolvedValue(mockBottles as never);
  mockCatList.mockResolvedValue(mockCategories as never);
  mockApiCreate.mockResolvedValue({} as never);
  mockApiUpdate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
  mockExport.mockResolvedValue(undefined);
  mockShortagesList.mockResolvedValue([] as never);
});

afterEach(clearToasts);

describe('BottlesPage', () => {
  describe('list', () => {
    it('renders the title and the header buttons', () => {
      renderPage();
      expect(screen.getByText('bottles.title')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'bottles.add' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'bottles.import' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'bottles.export' })).toBeInTheDocument();
    });

    it('lists the available bottles with their details', async () => {
      await renderLoadedPage();
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('700 ml')).toBeInTheDocument();
      expect(screen.getByText('25 €')).toBeInTheDocument();
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
      mockApiList.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('common.loading')).toBeInTheDocument();
      expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
    });

    it('shows "no results" once loaded without bottles', async () => {
      mockApiList.mockResolvedValue([] as never);
      renderPage();
      expect(await screen.findByText('common.noResults')).toBeInTheDocument();
    });

    it('shows a load error with a retry button', async () => {
      const user = userEvent.setup();
      mockApiList.mockRejectedValueOnce(new Error('Failed to fetch'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'common.retry' }));

      expect(await screen.findByText('Absolut')).toBeInTheDocument();
    });

    it('filters by name and by location', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.type(screen.getByPlaceholderText('common.search'), 'abs');
      expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('common.search'));

      await user.type(screen.getByTestId('location-autocomplete'), 'bar');
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
      mockApiList.mockResolvedValue([
        { ...mockBottles[0], category: { ...mockBottles[0].category, name: 'A-vodka', nameTranslations: { en: 'Zubrowka' } } },
        { ...mockBottles[1], category: { ...mockBottles[1].category, name: 'Z-gin', nameTranslations: { en: 'Gin' } } },
      ] as never);
      renderPage();
      await screen.findByText('Absolut');

      await user.click(screen.getByText('bottles.category'));

      const names = screen.getAllByText(/Absolut|Hendricks/).map((cell) => cell.textContent);
      expect(names).toEqual(['Hendricks', 'Absolut']);
    });

    it('groups identical bottles and lists them when the group is opened', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiList.mockResolvedValue([mockBottles[0], { ...mockBottles[0], id: 3, remainingPercent: 40 }, mockBottles[1]] as never);
      try {
        renderPage();

        await user.click(await screen.findByText('x2'));

        expect(screen.getAllByText('Absolut')).toHaveLength(3);
        expect(screen.getByText('~60%')).toBeInTheDocument();
        const keyWarnings = consoleError.mock.calls.filter((args) =>
          args.some((arg) => typeof arg === 'string' && arg.includes('unique "key"')));
        expect(keyWarnings).toHaveLength(0);
      } finally {
        consoleError.mockRestore();
      }
    });

    it('keeps a group open after a page change and back', async () => {
      const user = userEvent.setup();
      const singles = Array.from({ length: 25 }, (_, index) => ({ ...mockBottles[1], id: 100 + index, name: `Bottle ${index + 1}` }));
      const group = [{ ...mockBottles[0], id: 1 }, { ...mockBottles[0], id: 2 }];
      mockApiList.mockResolvedValue([...singles, ...group] as never);
      renderPage();
      await screen.findByText('Bottle 1');

      await user.click(screen.getByRole('button', { name: '2' }));
      await user.click(screen.getByText('x2'));
      expect(screen.getAllByText('Absolut')).toHaveLength(3);
      await user.click(screen.getByRole('button', { name: '1' }));
      await user.click(screen.getByRole('button', { name: '2' }));

      expect(screen.getAllByText('Absolut')).toHaveLength(3);
    });

    it('keeps a group open after a search hides it and shows it again', async () => {
      const user = userEvent.setup();
      mockApiList.mockResolvedValue([mockBottles[0], { ...mockBottles[0], id: 3 }, mockBottles[1]] as never);
      renderPage();
      await user.click(await screen.findByText('x2'));

      await user.type(screen.getByPlaceholderText('common.search'), 'hend');
      expect(screen.queryByText('Absolut')).not.toBeInTheDocument();
      await user.clear(screen.getByPlaceholderText('common.search'));

      expect(screen.getAllByText('Absolut')).toHaveLength(3);
    });

    it('closes an open group on a second click', async () => {
      const user = userEvent.setup();
      mockApiList.mockResolvedValue([mockBottles[0], { ...mockBottles[0], id: 3 }] as never);
      renderPage();
      await user.click(await screen.findByText('x2'));
      expect(screen.getAllByText('Absolut')).toHaveLength(3);

      await user.click(screen.getByText('x2'));

      expect(screen.getAllByText('Absolut')).toHaveLength(1);
    });

    it('keeps the empty bottles in a collapsed history', async () => {
      const user = userEvent.setup();
      mockApiList.mockResolvedValue([...mockBottles, emptyBottle] as never);
      await renderLoadedPage();
      expect(screen.queryByText('Finished rum')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /bottles\.historyTitle \(1\)/ }));

      expect(screen.getByText('Finished rum')).toBeInTheDocument();
      expect(screen.getByText('bottles.activeTitle (2)')).toBeInTheDocument();
    });
  });

  describe('form', () => {
    it('disables the add button while no category is loaded', async () => {
      mockCatList.mockResolvedValue([] as never);
      await renderLoadedPage();

      const addButton = screen.getByRole('button', { name: 'bottles.add' });
      expect(addButton).toBeDisabled();
      expect(addButton).toHaveAttribute('title', 'bottles.noCategoryHint');
    });

    it('creates a bottle in the first category and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByLabelText('Utilisable comme apéritif'));
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith({
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
      }));
      expect(await screen.findByText('bottles.created')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends every field of the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);
      const form = within(dialog());

      await user.type(nameInput(), 'Tanqueray');
      await user.selectOptions(form.getByLabelText('bottles.category'), '2');
      fireEvent.change(form.getByLabelText('bottles.capacityMl'), { target: { value: '1000' } });
      await user.type(form.getByLabelText('bottles.purchasePrice'), '32.5');
      fireEvent.change(form.getByLabelText(/bottles\.remainingPercent/), { target: { value: '60' } });
      fireEvent.change(form.getByLabelText('bottles.openedAt'), { target: { value: '2026-10-01' } });
      await user.type(form.getByLabelText('Alcool % (vol.)'), '43.1');
      await user.type(form.getByLabelText('bottles.location'), 'Shelf');
      await user.click(form.getByLabelText('Utilisable comme digestif'));
      await user.click(form.getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith({
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
      }));
    });

    it('creates several identical bottles at once', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);

      await user.type(nameInput(), 'Rum');
      // An emptied field snaps back to 1, so set the value in one go.
      fireEvent.change(within(dialog()).getByLabelText('bottles.quantity'), { target: { value: '3' } });
      expect(within(dialog()).getByText('bottles.quantityHint')).toBeInTheDocument();
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rum', quantity: 3 })));
    });

    it('sends a single request on a fast double click on save', async () => {
      const user = userEvent.setup();
      mockApiCreate.mockReturnValue(new Promise(() => {}));
      await renderLoadedPage();
      await openCreateForm(user);
      await user.type(nameInput(), 'Rum');
      const save = within(dialog()).getByRole('button', { name: 'common.save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      expect(mockApiCreate).toHaveBeenCalledTimes(1);
    });

    it('does not submit "save and duplicate" when the name is empty', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);

      await user.click(within(dialog()).getByRole('button', { name: 'bottles.saveDuplicate' }));

      expect(mockApiCreate).not.toHaveBeenCalled();
      expect((nameInput() as HTMLInputElement).validity.valueMissing).toBe(true);
    });

    it('creates the bottle and keeps the form open on "save and duplicate"', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky');
      await user.click(within(dialog()).getByRole('button', { name: 'bottles.saveDuplicate' }));

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Whisky', categoryId: 1 })));
      expect(within(dialog()).getByDisplayValue('New Whisky')).toBeInTheDocument();

      // The intent is reset: a plain save afterwards closes the form.
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockApiCreate).toHaveBeenCalledTimes(2);
    });

    it('pressing Enter in the name field saves and closes the form', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await openCreateForm(user);

      await user.type(nameInput(), 'New Whisky{Enter}');

      await waitFor(() => expect(mockApiCreate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('opens the edit form filled with the bottle', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[1]);

      expect(screen.getByText('bottles.edit')).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Hendricks');
      expect(within(dialog()).getByLabelText('bottles.openedAt')).toHaveValue('2024-06-01');
      expect(within(dialog()).getByLabelText('Utilisable comme apéritif')).toBeChecked();
      expect(within(dialog()).getByLabelText('Utilisable comme digestif')).not.toBeChecked();
      expect(within(dialog()).queryByRole('button', { name: 'bottles.saveDuplicate' })).not.toBeInTheDocument();
    });

    it('updates a bottle without a quantity and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);

      await user.clear(nameInput());
      await user.type(nameInput(), 'Absolut Elyx');
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'Absolut Elyx',
        purchasePrice: 25,
        alcoholPercentage: 40,
        location: 'Bar',
      })));
      expect(mockApiUpdate.mock.calls[0][1]).not.toHaveProperty('quantity');
      expect(await screen.findByText('bottles.updated')).toBeInTheDocument();
    });

    it('refreshes the shortages badge after a bottle is updated, without leaving the page', async () => {
      const user = userEvent.setup();
      renderWithFeedback(<><BottlesPage /><ShortagesBadge /></>);
      await screen.findByText('Absolut');
      await waitFor(() => expect(mockShortagesList).toHaveBeenCalledTimes(1));
      mockShortagesList.mockResolvedValue([{ categoryId: 1 }] as never);

      await user.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);
      await user.click(within(dialog()).getByRole('button', { name: 'common.save' }));

      await waitFor(() => expect(screen.getByTestId('shortages-badge')).toHaveTextContent('1'));
      expect(mockShortagesList).toHaveBeenCalledTimes(2);
    });
  });

  describe('deletion', () => {
    it('deletes a bottle after confirmation and confirms with a toast', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await confirmDeletion(user);

      await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith(1));
      expect(await screen.findByText('bottles.deleted')).toBeInTheDocument();
    });

    it('deletes an empty bottle from the history', async () => {
      const user = userEvent.setup();
      mockApiList.mockResolvedValue([emptyBottle] as never);
      renderPage();
      await user.click(await screen.findByRole('button', { name: /bottles\.historyTitle/ }));

      await confirmDeletion(user);

      await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith(9));
    });

    it('does not delete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

      expect(mockApiDelete).not.toHaveBeenCalled();
    });

    it('shows the backend message and the cocktails of a bottle in use', async () => {
      const user = userEvent.setup();
      mockApiDelete.mockRejectedValue(new ApiError(409, 'This bottle is used by cocktails', {
        error: 'This bottle is used by cocktails',
        details: { cocktails: [{ id: 4, name: 'Moscow Mule', removedLines: 1 }], bottles: [] },
      }));
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

      await user.click(screen.getByRole('button', { name: 'bottles.import' }));
      await user.click(screen.getByText('finish-import'));

      const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(refreshed).toEqual([qk.bottles, qk.shortages, qk.categories, qk.menus, qk.availability, qk.categoryTypes]);
      await waitFor(() => expect(mockApiList).toHaveBeenCalledTimes(2));
    });

    it('exports the filtered bottles in the chosen format', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      await user.type(screen.getByPlaceholderText('common.search'), 'abs');

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportCsv'));

      await waitFor(() => expect(mockExport).toHaveBeenCalledWith('csv', { categoryId: undefined, search: 'abs', location: undefined }));
      expect(screen.queryByText('bottles.exportJson')).not.toBeInTheDocument();
    });

    it('exports in JSON', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportJson'));

      await waitFor(() => expect(mockExport).toHaveBeenCalledWith('json', expect.any(Object)));
    });

    it('closes the export menu on a click outside', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      expect(screen.getByText('bottles.exportJson')).toBeInTheDocument();
      await user.click(screen.getByText('bottles.title'));

      expect(screen.queryByText('bottles.exportJson')).not.toBeInTheDocument();
    });

    it('shows an export failure in an error toast', async () => {
      const user = userEvent.setup();
      mockExport.mockRejectedValue(new Error('Network down'));
      await renderLoadedPage();

      await user.click(screen.getByRole('button', { name: 'bottles.export' }));
      await user.click(screen.getByText('bottles.exportJson'));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network down'));
    });
  });
});
