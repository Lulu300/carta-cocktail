import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import IngredientsPage from './IngredientsPage';

vi.mock('../../services/api', () => ({
  ingredients: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), bulkAvailability: vi.fn() },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

vi.mock('../../components/ui/IconPicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="icon-picker">
      <input data-testid="icon-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}));

import { ingredients as api } from '../../services/api';

const mockApiList = vi.mocked(api.list);
const mockApiCreate = vi.mocked(api.create);
const mockApiUpdate = vi.mocked(api.update);
const mockApiDelete = vi.mocked(api.delete);
const mockApiBulkAvailability = vi.mocked(api.bulkAvailability);

const mockIngredients = [
  { id: 1, name: 'Lime', nameTranslations: null, icon: '🍋', isAvailable: true, createdAt: '2024-01-01' },
  { id: 2, name: 'Sugar', nameTranslations: null, icon: null, isAvailable: false, createdAt: '2024-01-01' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApiList.mockResolvedValue(mockIngredients as never);
  mockApiCreate.mockResolvedValue({} as never);
  mockApiUpdate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
  mockApiBulkAvailability.mockResolvedValue({} as never);
});

describe('IngredientsPage', () => {
  it('renders title "ingredients.title" and action buttons', async () => {
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.title')).toBeInTheDocument();
      expect(screen.getByText('ingredients.allAvailable')).toBeInTheDocument();
      expect(screen.getByText('ingredients.allUnavailable')).toBeInTheDocument();
      expect(screen.getByText('ingredients.add')).toBeInTheDocument();
    });
  });

  it('displays ingredient cards after loading', async () => {
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
      expect(screen.getByText('Sugar')).toBeInTheDocument();
      expect(screen.getByText('🍋')).toBeInTheDocument();
      expect(screen.getByText('📦')).toBeInTheDocument();
    });
  });

  it('shows "common.noResults" when empty list', async () => {
    mockApiList.mockResolvedValue([] as never);
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });

  it('shows availability filter buttons with counts', async () => {
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.filter.all')).toBeInTheDocument();
      expect(screen.getByText('ingredients.filter.available')).toBeInTheDocument();
      expect(screen.getByText('ingredients.filter.unavailable')).toBeInTheDocument();
      // available count: 1 (Lime), unavailable count: 1 (Sugar)
      const counts = screen.getAllByText('(1)');
      expect(counts).toHaveLength(2);
    });
  });

  it('opens create modal on add click', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.add'));
    const headings = screen.getAllByText('ingredients.add');
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('common.save')).toBeInTheDocument();
    expect(screen.getByTestId('icon-picker')).toBeInTheDocument();
  });

  it('calls bulkAvailability when clicking "all available" button', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.allAvailable')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.allAvailable'));
    await waitFor(() => {
      expect(mockApiBulkAvailability).toHaveBeenCalledWith({ available: true });
    });
  });

  it('calls delete API with confirm on delete button click', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(1);
    });
  });

  it('opens edit modal pre-filled with ingredient data', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);
    expect(screen.getByText('ingredients.edit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lime')).toBeInTheDocument();
  });

  it('submits update when editing an ingredient', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);
    const nameInput = screen.getByDisplayValue('Lime');
    await user.clear(nameInput);
    await user.type(nameInput, 'Lemon');
    await user.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(mockApiUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Lemon' })
      );
    });
  });

  it('submits create form with filled name', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.add'));
    // The modal form contains the name input; find it via the form element
    const form = document.querySelector('form')!;
    const nameInput = form.querySelector('input[required]') as HTMLInputElement;
    await user.type(nameInput, 'Mint');
    await user.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mint' })
      );
    });
  });

  it('does not call delete when confirm returns false', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('calls bulkAvailability with false when clicking "all unavailable" button', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('ingredients.allUnavailable')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.allUnavailable'));
    await waitFor(() => {
      expect(mockApiBulkAvailability).toHaveBeenCalledWith({ available: false });
    });
  });

  it('filters by available when clicking available filter', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.filter.available'));
    // Only Lime (isAvailable=true) should be visible
    expect(screen.getByText('Lime')).toBeInTheDocument();
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
  });

  it('filters by unavailable when clicking unavailable filter', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });
    await user.click(screen.getByText('ingredients.filter.unavailable'));
    // Only Sugar (isAvailable=false) should be visible
    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.queryByText('Lime')).not.toBeInTheDocument();
  });

  it('filters by search term', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });
    const searchInput = screen.getByRole('textbox');
    await user.type(searchInput, 'Lime');
    expect(screen.getByText('Lime')).toBeInTheDocument();
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
  });

  it('calls update when clicking ingredient card to toggle availability', async () => {
    const user = userEvent.setup();
    render(<IngredientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Lime')).toBeInTheDocument();
    });
    // Clicking the card (not buttons) triggers toggleAvailability
    // Find the card by its text, then click the card container
    const limeCard = screen.getByText('Lime').closest('div[class*="relative"]');
    if (limeCard) {
      await user.click(limeCard);
      await waitFor(() => {
        expect(mockApiUpdate).toHaveBeenCalledWith(1, { isAvailable: false });
      });
    }
  });
});
