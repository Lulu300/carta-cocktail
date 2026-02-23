import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import BottlesPage from './BottlesPage';

vi.mock('../../services/api', () => ({
  bottles: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  categories: { list: vi.fn() },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

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

import { bottles as api, categories as categoriesApi } from '../../services/api';

const mockApiList = vi.mocked(api.list);
const mockApiCreate = vi.mocked(api.create);
const mockApiUpdate = vi.mocked(api.update);
const mockApiDelete = vi.mocked(api.delete);
const mockCatList = vi.mocked(categoriesApi.list);

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
    openedAt: '2024-06-01',
    purchasePrice: null,
    alcoholPercentage: 41.4,
    location: null,
    isApero: true,
    isDigestif: false,
    createdAt: '2024-01-01',
  },
];

const mockCategories = [
  { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 },
  { id: 2, name: 'Gin', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApiList.mockResolvedValue(mockBottles as never);
  mockCatList.mockResolvedValue(mockCategories as never);
  mockApiCreate.mockResolvedValue({} as never);
  mockApiUpdate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
});

describe('BottlesPage', () => {
  it('renders title "bottles.title" and add button', async () => {
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('bottles.title')).toBeInTheDocument();
      expect(screen.getByText('bottles.add')).toBeInTheDocument();
    });
  });

  it('displays bottles in table after loading', async () => {
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('Gin')).toBeInTheDocument();
      expect(screen.getByText('700 ml')).toBeInTheDocument();
      expect(screen.getByText('500 ml')).toBeInTheDocument();
      expect(screen.getByText('25 €')).toBeInTheDocument();
    });
  });

  it('shows "common.noResults" when empty list', async () => {
    mockApiList.mockResolvedValue([] as never);
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });

  it('opens create modal on "bottles.add" click', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('bottles.add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('bottles.add'));
    // Modal heading appears (h2 with "bottles.add" text in create mode)
    const headings = screen.getAllByText('bottles.add');
    // One is the button, one is the modal h2
    expect(headings.length).toBeGreaterThanOrEqual(2);
    // Save button appears in modal
    expect(screen.getByText('common.save')).toBeInTheDocument();
  });

  it('opens edit modal with pre-filled data on edit button click', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);
    // Modal should appear with edit title
    expect(screen.getByText('bottles.edit')).toBeInTheDocument();
    // Name field should be pre-filled with 'Absolut'
    const nameInput = screen.getByDisplayValue('Absolut');
    expect(nameInput).toBeInTheDocument();
  });

  it('calls delete API with confirm on delete button click', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(1);
    });
  });

  it('applies correct color class for remainingPercent: green >50, yellow >20, red <=20', async () => {
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
    // Absolut has remainingPercent=80 -> green
    const greenBar = document.querySelector('.bg-green-500');
    expect(greenBar).not.toBeNull();
    // Hendricks has remainingPercent=20 -> red
    const redBar = document.querySelector('.bg-red-500');
    expect(redBar).not.toBeNull();
  });

  it('submits create form with correct data', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('bottles.add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('bottles.add'));

    // The modal form's name input has the required attribute
    const form = document.querySelector('form')!;
    const nameInput = form.querySelector('input[required]') as HTMLInputElement;
    await user.type(nameInput, 'New Whisky');

    await user.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Whisky' })
      );
    });
  });

  it('submits edit form and calls api.update', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Absolut');
    await user.clear(nameInput);
    await user.type(nameInput, 'Absolut Elyx');

    await user.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(mockApiUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Absolut Elyx' })
      );
    });
  });

  it('does not call delete when confirm returns false', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('filters by search term', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Absolut')).toBeInTheDocument();
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
    });
    // Use placeholder to distinguish search input from location autocomplete
    const searchInput = screen.getByPlaceholderText('common.search');
    await user.type(searchInput, 'Absolut');
    expect(screen.getByText('Absolut')).toBeInTheDocument();
    expect(screen.queryByText('Hendricks')).not.toBeInTheDocument();
  });

  it('shows price "-" for bottle with null price', async () => {
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
    });
    // Hendricks has purchasePrice: null -> should show '-'
    // Absolut has 25 -> '25 €'
    expect(screen.getByText('25 €')).toBeInTheDocument();
    // The '-' for null price
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "bottles.opened" badge for opened bottle and "bottles.unopened" for sealed', async () => {
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('bottles.opened')).toBeInTheDocument();
      expect(screen.getByText('bottles.unopened')).toBeInTheDocument();
    });
  });

  it('shows isApero and isDigestif checkboxes in create modal', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('bottles.add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('bottles.add'));

    const checkboxes = screen.getAllByRole('checkbox');
    // Two checkboxes: isApero and isDigestif
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);

    // Toggle isApero (first checkbox)
    await user.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it('pre-fills isApero=true in edit modal for Hendricks', async () => {
    const user = userEvent.setup();
    render(<BottlesPage />);
    await waitFor(() => {
      expect(screen.getByText('Hendricks')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    // Hendricks is the second bottle (index 1)
    await user.click(editButtons[1]);

    const checkboxes = screen.getAllByRole('checkbox');
    // Hendricks has isApero=true
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    // isDigestif=false
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });
});
