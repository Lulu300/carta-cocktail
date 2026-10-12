import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, createTestQueryClient } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import userEvent from '@testing-library/user-event';
import CocktailsPage from './CocktailsPage';
import { qk } from '../../queries/keys';

vi.mock('../../services/api', () => ({
  cocktails: { list: vi.fn(), delete: vi.fn(), exportRecipe: vi.fn() },
  availability: { getAllCocktails: vi.fn() },
}));

vi.mock('../../services/exportZip', () => ({
  exportCocktailsAsZip: vi.fn(),
}));

vi.mock('../../components/ui/ExportCocktailButton', () => ({
  default: ({ cocktailName }: { cocktailName: string }) => (
    <button data-testid={`export-${cocktailName}`}>export</button>
  ),
}));

vi.mock('../../components/import/ImportCocktailWizard', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { cocktails as api, availability as availabilityApi } from '../../services/api';
import { exportCocktailsAsZip } from '../../services/exportZip';

const mockCocktails = [
  {
    id: 1,
    name: 'Mojito',
    description: 'Classic',
    notes: 'Jus de citron frais',
    imagePath: null,
    tags: 'rum,lime',
    isAvailable: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 2,
    name: 'Negroni',
    description: null,
    notes: null,
    imagePath: 'negroni.jpg',
    tags: '',
    isAvailable: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const mockAvailabilities = {
  1: {
    cocktailId: 1,
    isAvailable: true,
    maxServings: 5,
    ingredients: [],
    missingIngredients: [],
    lowStockWarnings: [],
  },
  2: {
    cocktailId: 2,
    isAvailable: false,
    maxServings: 0,
    ingredients: [],
    missingIngredients: ['Campari'],
    lowStockWarnings: [],
  },
};

// The page asks for confirmation and reports through toasts.
const render = renderWithFeedback;

describe('CocktailsPage', () => {
  afterEach(clearToasts);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.list).mockResolvedValue(mockCocktails);
    vi.mocked(availabilityApi.getAllCocktails).mockResolvedValue(mockAvailabilities);
  });

  it('renders title and action buttons', async () => {
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
    });

    expect(screen.getByText('cocktails.title')).toBeInTheDocument();
    expect(screen.getByText('cocktails.batchExport')).toBeInTheDocument();
    expect(screen.getByText('cocktails.import')).toBeInTheDocument();
    expect(screen.getByText('cocktails.add')).toBeInTheDocument();
  });

  it('displays cocktail cards after loading', async () => {
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
    });

    expect(screen.getByText('Negroni')).toBeInTheDocument();
    expect(screen.getByText('Classic')).toBeInTheDocument();
    expect(screen.getByText('rum')).toBeInTheDocument();
    expect(screen.getByText('lime')).toBeInTheDocument();
    expect(screen.getByTestId('cocktails-grid-view')).toBeInTheDocument();
  });

  it('switches between grid and list views', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
    });

    expect(screen.getByTestId('cocktails-grid-view')).toBeInTheDocument();
    expect(screen.queryByTestId('cocktails-list-view')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));

    expect(screen.getByTestId('cocktails-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('cocktails-grid-view')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'cocktails.viewGrid' }));

    expect(screen.getByTestId('cocktails-grid-view')).toBeInTheDocument();
  });

  it('matches multiple search terms across recipe fields', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    const search = await screen.findByPlaceholderText('common.search');
    await user.type(search, 'rum citron');

    expect(screen.getByText('Mojito')).toBeInTheDocument();
    expect(screen.queryByText('Negroni')).not.toBeInTheDocument();
  });

  it('shows noResults when empty', async () => {
    vi.mocked(api.list).mockResolvedValue([]);

    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });

  it('shows availability badges after loading', async () => {
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
    });

    // Mojito: 5 doses (green badge)
    expect(screen.getByText('5 doses')).toBeInTheDocument();

    // Negroni: unavailable (red badge)
    expect(screen.getByText('Indisponible')).toBeInTheDocument();
  });

  it('still lists cocktails, without availability badges, when availability fails to load', async () => {
    const user = userEvent.setup();
    vi.mocked(availabilityApi.getAllCocktails).mockRejectedValueOnce(new Error('offline'));
    render(<CocktailsPage />);

    await screen.findAllByText('Mojito');
    await user.click(await screen.findByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('5 doses')).toBeInTheDocument();
    expect(screen.getByText('Indisponible')).toBeInTheDocument();
  });

  it('hides availability while it reloads after an import', async () => {
    const user = userEvent.setup();
    let resolveReload: (value: typeof mockAvailabilities) => void = () => {};
    render(<CocktailsPage />);
    expect(await screen.findByText('5 doses')).toBeInTheDocument();

    vi.mocked(availabilityApi.getAllCocktails).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReload = resolve;
      }),
    );
    await user.click(screen.getByText('cocktails.import'));
    await user.click(screen.getByText('close'));

    expect(screen.queryByText('5 doses')).not.toBeInTheDocument();
    resolveReload(mockAvailabilities);
    expect(await screen.findByText('5 doses')).toBeInTheDocument();
  });

  it('shows missing ingredients warning on unavailable cocktails', async () => {
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Negroni')).toBeInTheDocument();
    });

    expect(screen.getByText('Campari')).toBeInTheDocument();
  });

  it('enters selection mode and shows checkboxes on batch export click', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mojito')).toBeInTheDocument();
    });

    await user.click(screen.getByText('cocktails.batchExport'));

    // Select all checkbox and export ZIP button should appear
    expect(screen.getByText('cocktails.selectAll')).toBeInTheDocument();
    expect(screen.getByText(/cocktails.exportZip/)).toBeInTheDocument();

    // Card checkboxes should be visible (one per cocktail card)
    const checkboxes = screen.getAllByRole('checkbox');
    // select-all + one per card = 3 total
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('selects and exports only the filtered cocktails with "select all"', async () => {
    const user = userEvent.setup();
    const daiquiri = { ...mockCocktails[1], id: 3, name: 'Daiquiri', imagePath: null };
    vi.mocked(api.list).mockResolvedValue([...mockCocktails, daiquiri]);
    render(<CocktailsPage />);

    const search = await screen.findByPlaceholderText('common.search');
    await screen.findByText('Daiquiri');
    await user.type(search, 'rum citron');
    expect(screen.queryByText('Daiquiri')).not.toBeInTheDocument();

    await user.click(screen.getByText('cocktails.batchExport'));
    const selectAll = screen.getByLabelText('cocktails.selectAll');
    await user.click(selectAll);
    expect(selectAll).toBeChecked();

    await user.click(screen.getByText(/cocktails.exportZip/));

    await waitFor(() => {
      expect(exportCocktailsAsZip).toHaveBeenCalledWith(
        [1],
        [expect.objectContaining({ id: 1 })],
      );
    });
  });

  it('unchecking "select all" clears only the filtered cocktails', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    await screen.findByText('Negroni');
    await user.click(screen.getByText('cocktails.batchExport'));

    // Select Negroni while it is visible, then filter it out
    const negroniCard = screen.getByText('Negroni').closest('div.rounded-xl') as HTMLElement;
    await user.click(negroniCard);

    await user.type(screen.getByPlaceholderText('common.search'), 'rum citron');
    const selectAll = screen.getByLabelText('cocktails.selectAll');
    expect(selectAll).not.toBeChecked();

    await user.click(selectAll);
    expect(selectAll).toBeChecked();
    await user.click(selectAll);
    expect(selectAll).not.toBeChecked();

    // Negroni stays selected: the export button still counts one cocktail
    await user.click(screen.getByText(/cocktails.exportZip/));
    await waitFor(() => {
      expect(exportCocktailsAsZip).toHaveBeenCalledWith(
        [2],
        [expect.objectContaining({ id: 2 })],
      );
    });
  });

  it('opens import wizard modal on import button click', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();

    await user.click(screen.getByText('cocktails.import'));

    expect(screen.getByTestId('import-wizard')).toBeInTheDocument();

    // Closing the wizard hides it
    await user.click(screen.getByText('close'));

    await waitFor(() => {
      expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();
    });
  });

  it('refreshes every list an import may change when the import wizard closes', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<CocktailsPage />, { queryClient });
    await screen.findAllByText('Mojito');

    await user.click(screen.getByText('cocktails.import'));
    await user.click(screen.getByText('close'));

    const refreshed = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(refreshed).toEqual([
      qk.cocktails,
      qk.availability,
      qk.units,
      qk.categories,
      qk.categoryTypes,
      qk.bottles,
      qk.ingredients,
      qk.shortages,
    ]);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(availabilityApi.getAllCocktails).toHaveBeenCalledTimes(2);
  });

  it('deletes a cocktail once the dialog is confirmed, then refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockResolvedValue({ message: 'ok' });
    render(<CocktailsPage />);
    await screen.findByText('Mojito');

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(1));
    expect(await screen.findByText('cocktails.deleted')).toBeInTheDocument();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('reports a failed batch export in a toast and keeps the selection', async () => {
    const user = userEvent.setup();
    vi.mocked(exportCocktailsAsZip).mockRejectedValue(new Error('Export failed'));
    render(<CocktailsPage />);
    await screen.findByText('Mojito');

    await user.click(screen.getByText('cocktails.batchExport'));
    await user.click(screen.getByRole('checkbox', { name: 'Mojito' }));
    await user.click(screen.getByText(/cocktails.exportZip/));

    expect(await screen.findByText('Export failed')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mojito' })).toBeChecked();
  });

  it('leaves the selection mode and clears the selection on cancel', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);
    await screen.findByText('Mojito');

    await user.click(screen.getByText('cocktails.batchExport'));
    await user.click(screen.getByRole('checkbox', { name: 'Mojito' }));
    await user.click(screen.getByRole('button', { name: 'common.cancel' }));
    await user.click(screen.getByText('cocktails.batchExport'));

    expect(screen.getByRole('checkbox', { name: 'Mojito' })).not.toBeChecked();
  });

  it('selects a cocktail with a click on its row in the list view', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);
    await screen.findByText('Mojito');
    await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));
    await user.click(screen.getByText('cocktails.batchExport'));

    await user.click(screen.getByText('Negroni'));
    await user.click(screen.getByText(/cocktails.exportZip/));

    await waitFor(() => {
      expect(exportCocktailsAsZip).toHaveBeenCalledWith([2], [expect.objectContaining({ id: 2 })]);
    });
  });

  it('lists the stock warnings, among them the category lines without an available preferred bottle', async () => {
    vi.mocked(availabilityApi.getAllCocktails).mockResolvedValue({
      ...mockAvailabilities,
      1: {
        ...mockAvailabilities[1],
        lowStockWarnings: ['Rum is running low'],
        missingIngredients: ['Mint', 'Lime', 'Soda'],
        ingredients: [{
          cocktailIngredientId: 1, sourceType: 'CATEGORY', name: 'White rum', icon: null, quantity: 5,
          unit: 'cl', isAvailable: true, availableCount: 5, preferredAvailable: false,
        }],
      },
    });
    render(<CocktailsPage />);

    expect(await screen.findByText('White rum')).toBeInTheDocument();
    expect(screen.getByText('⚠️ cocktails.noPreferredAvailable')).toBeInTheDocument();
    expect(screen.getByText('Rum is running low')).toBeInTheDocument();
    expect(screen.getByText('+1 autre(s)')).toBeInTheDocument();
  });

  it('filters the cocktails by tag, ignoring case', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockResolvedValue([mockCocktails[0], { ...mockCocktails[1], tags: 'Bitter, RUM' }, { ...mockCocktails[1], id: 3, name: 'Spritz', tags: 'bitter' }]);
    render(<CocktailsPage />);
    await screen.findByText('Spritz');

    await user.click(screen.getByRole('button', { name: 'cocktails.filterByTags' }));
    await user.click(screen.getByRole('checkbox', { name: 'rum' }));

    expect(screen.getByText('Mojito')).toBeInTheDocument();
    expect(screen.getByText('Negroni')).toBeInTheDocument();
    expect(screen.queryByText('Spritz')).not.toBeInTheDocument();
  });

  it('toggles a cocktail with its checkbox in the list view', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);
    await screen.findByText('Mojito');
    await user.click(screen.getByRole('button', { name: 'cocktails.viewList' }));
    await user.click(screen.getByText('cocktails.batchExport'));

    const checkbox = screen.getByRole('checkbox', { name: 'Mojito' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('offers to retry when the list fails to load', async () => {
    const user = userEvent.setup();
    vi.mocked(api.list).mockRejectedValueOnce(new Error('offline'));
    render(<CocktailsPage />);

    await user.click(await screen.findByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Mojito')).toBeInTheDocument();
  });
});
