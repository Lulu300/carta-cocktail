import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, createTestQueryClient } from '../../test/test-utils';
import { clearToasts, renderWithFeedback } from '../../test/feedback';
import userEvent from '@testing-library/user-event';
import CocktailsPage from './CocktailsPage';
import { qk } from '../../queries/keys';
import { buildAvailability, buildCocktail } from '../../test/factories';
import { captureRequest, holdApiResponse, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import type { Cocktail } from '../../types';

// Builds a ZIP of every selected recipe: services/exportZip.test.ts covers it.
vi.mock('../../services/exportZip', () => ({
  exportCocktailsAsZip: vi.fn(),
}));

// The wizard has its own tests: here it only has to close.
vi.mock('../../components/import/ImportCocktailWizard', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-wizard">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { exportCocktailsAsZip } from '../../services/exportZip';

const mojito = buildCocktail({ id: 1, name: 'Mojito', description: 'Classic', notes: 'Jus de citron frais', tags: 'rum,lime' });
const negroni = buildCocktail({ id: 2, name: 'Negroni', imagePath: 'negroni.jpg' });

const mockAvailabilities = {
  1: buildAvailability({ cocktailId: 1, maxServings: 5 }),
  2: buildAvailability({ cocktailId: 2, isAvailable: false, maxServings: 0, missingIngredients: ['Campari'] }),
};

function mockCocktails(cocktails: Cocktail[]) {
  mockApiResponse('get', '/api/cocktails', cocktails);
}

// The page asks for confirmation and reports through toasts.
const render = renderWithFeedback;

describe('CocktailsPage', () => {
  afterEach(clearToasts);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCocktails([mojito, negroni]);
    mockApiResponse('get', '/api/availability/cocktails', mockAvailabilities);
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
    // The real export button of each card
    expect(screen.getAllByTitle('cocktails.export')).toHaveLength(2);
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
    mockCocktails([]);

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
    expect(screen.getByText('cocktails.doses')).toBeInTheDocument();

    // Negroni: unavailable (red badge)
    expect(screen.getByText('cocktails.unavailable')).toBeInTheDocument();
  });

  it('still lists cocktails, without availability badges, when availability fails to load', async () => {
    const user = userEvent.setup();
    mockNetworkError('get', '/api/availability/cocktails');
    render(<CocktailsPage />);

    await screen.findAllByText('Mojito');
    const retry = await screen.findByRole('button', { name: 'common.retry' });
    mockApiResponse('get', '/api/availability/cocktails', mockAvailabilities);
    await user.click(retry);

    expect(await screen.findByText('cocktails.doses')).toBeInTheDocument();
    expect(screen.getByText('cocktails.unavailable')).toBeInTheDocument();
  });

  it('hides availability while it reloads after an import', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);
    expect(await screen.findByText('cocktails.doses')).toBeInTheDocument();

    const releaseReload = holdApiResponse('get', '/api/availability/cocktails', mockAvailabilities);
    await user.click(screen.getByText('cocktails.import'));
    await user.click(screen.getByText('close'));

    expect(screen.queryByText('cocktails.doses')).not.toBeInTheDocument();
    releaseReload();
    expect(await screen.findByText('cocktails.doses')).toBeInTheDocument();
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
    const daiquiri = buildCocktail({ id: 3, name: 'Daiquiri' });
    mockCocktails([mojito, negroni, daiquiri]);
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
      expect(exportCocktailsAsZip).toHaveBeenCalledWith([1]);
    });
  });

  it('unchecking "select all" clears only the filtered cocktails', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);

    await screen.findByText('Negroni');
    await user.click(screen.getByText('cocktails.batchExport'));

    // Select Negroni while it is visible, then filter it out
    const negroniCard = screen.getByText('Negroni').closest('div.rounded-xl');
    if (!(negroniCard instanceof HTMLElement)) throw new Error('No card for Negroni');
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
      expect(exportCocktailsAsZip).toHaveBeenCalledWith([2]);
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
    const cocktailsReloaded = captureRequest('get', '/api/cocktails');
    const availabilityReloaded = captureRequest('get', '/api/availability/cocktails');

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
    await waitFor(() => expect(cocktailsReloaded.count()).toBe(1));
    await waitFor(() => expect(availabilityReloaded.count()).toBe(1));
  });

  it('deletes a cocktail once the dialog is confirmed, then refreshes the list', async () => {
    const user = userEvent.setup();
    render(<CocktailsPage />);
    await screen.findByText('Mojito');
    const deleted = captureRequest('delete', '/api/cocktails/:id');
    const reloaded = captureRequest('get', '/api/cocktails');

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));
    expect(deleted.count()).toBe(0);

    await user.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    expect(await screen.findByText('cocktails.deleted')).toBeInTheDocument();
    expect((await deleted.url).pathname).toBe('/api/cocktails/1');
    await waitFor(() => expect(reloaded.count()).toBe(1));
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
      expect(exportCocktailsAsZip).toHaveBeenCalledWith([2]);
    });
  });

  it('lists the stock warnings, among them the category lines without an available preferred bottle', async () => {
    mockApiResponse('get', '/api/availability/cocktails', {
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
    expect(screen.getByText('⚠️ cocktails.lowStock')).toBeInTheDocument();
    expect(screen.getByText('Rum is running low')).toBeInTheDocument();
    expect(screen.getByText('cocktails.moreMissing')).toBeInTheDocument();
  });

  it('filters the cocktails by tag, ignoring case', async () => {
    const user = userEvent.setup();
    mockCocktails([mojito, { ...negroni, tags: 'Bitter, RUM' }, buildCocktail({ id: 3, name: 'Spritz', tags: 'bitter' })]);
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
    mockNetworkError('get', '/api/cocktails');
    render(<CocktailsPage />);

    const retry = await screen.findByRole('button', { name: 'common.retry' });
    mockCocktails([mojito, negroni]);
    await user.click(retry);

    expect(await screen.findByText('Mojito')).toBeInTheDocument();
  });
});
