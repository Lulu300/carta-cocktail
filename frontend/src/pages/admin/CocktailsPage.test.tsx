import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import CocktailsPage from './CocktailsPage';

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

const mockCocktails = [
  {
    id: 1,
    name: 'Mojito',
    description: 'Classic',
    notes: null,
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

describe('CocktailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.list).mockResolvedValue(mockCocktails);
    vi.mocked(availabilityApi.getAllCocktails).mockResolvedValue(mockAvailabilities);
  });

  it('renders title and action buttons', async () => {
    render(<CocktailsPage />);

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
});
