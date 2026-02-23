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
});
