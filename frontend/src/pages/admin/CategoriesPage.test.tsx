import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import CategoriesPage from './CategoriesPage';

vi.mock('../../services/api', () => ({
  categories: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  categoryTypes: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

vi.mock('../../utils/colors', () => ({
  getBadgeClasses: () => 'bg-gray-500/20 text-gray-400',
  CATEGORY_TYPE_COLORS: ['gray', 'red', 'blue'],
  COLOR_DOT_CLASSES: { gray: 'bg-gray-400', red: 'bg-red-400', blue: 'bg-blue-400' },
}));

import { categories as api, categoryTypes as ctApi } from '../../services/api';

const mockApiList = vi.mocked(api.list);
const mockApiCreate = vi.mocked(api.create);
const mockApiDelete = vi.mocked(api.delete);
const mockCtApiList = vi.mocked(ctApi.list);

const mockCategories = [
  { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue', nameTranslations: null }, desiredStock: 2, _count: { bottles: 3 } },
  { id: 2, name: 'Grenadine', type: 'SYRUP', categoryType: { name: 'SYRUP', color: 'red', nameTranslations: null }, desiredStock: 1, _count: { bottles: 1 } },
];
const mockCatTypes = [
  { name: 'SPIRIT', color: 'blue', nameTranslations: null, _count: { categories: 1 } },
  { name: 'SYRUP', color: 'red', nameTranslations: null, _count: { categories: 1 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApiList.mockResolvedValue(mockCategories as never);
  mockCtApiList.mockResolvedValue(mockCatTypes as never);
  mockApiCreate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
});

describe('CategoriesPage', () => {
  it('renders title and action buttons', async () => {
    render(<CategoriesPage />);
    await waitFor(() => {
      expect(screen.getByText('categories.title')).toBeInTheDocument();
    });
    expect(screen.getByText('categories.add')).toBeInTheDocument();
    expect(screen.getByText('categoryTypes.manage')).toBeInTheDocument();
  });

  it('displays categories in table after loading', async () => {
    render(<CategoriesPage />);
    await waitFor(() => {
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('Grenadine')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('shows "common.noResults" when categories list is empty', async () => {
    mockApiList.mockResolvedValue([] as never);
    render(<CategoriesPage />);
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });

  it('opens create modal when add button is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));

    expect(screen.getByText('categories.add', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('opens edit modal with pre-filled data when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    expect(screen.getByText('categories.edit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vodka')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
  });

  it('calls api.delete after confirm dialog on delete click', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith('categories.confirmDelete');
    expect(mockApiDelete).toHaveBeenCalledWith(1);
  });

  it('opens type management modal when manage types button is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    expect(screen.getByText('categoryTypes.title')).toBeInTheDocument();
    expect(screen.getAllByText('SPIRIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SYRUP').length).toBeGreaterThan(0);
  });
});
