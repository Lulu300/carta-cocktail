import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils';
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
const mockApiUpdate = vi.mocked(api.update);
const mockApiDelete = vi.mocked(api.delete);
const mockCtApiList = vi.mocked(ctApi.list);
const mockCtApiCreate = vi.mocked(ctApi.create);
const mockCtApiUpdate = vi.mocked(ctApi.update);
const mockCtApiDelete = vi.mocked(ctApi.delete);

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
  mockApiUpdate.mockResolvedValue({} as never);
  mockApiDelete.mockResolvedValue({} as never);
  mockCtApiCreate.mockResolvedValue({} as never);
  mockCtApiUpdate.mockResolvedValue({} as never);
  mockCtApiDelete.mockResolvedValue({} as never);
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

  // --- New tests below ---

  it('does not call api.delete when confirm returns false', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith('categories.confirmDelete');
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('submits create form and calls api.create with correct data', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));

    // name input is the first textbox in the modal (search input is also a textbox)
    const textboxes = screen.getAllByRole('textbox');
    // textboxes[0] = search, textboxes[1] = name input in modal
    const nameInput = textboxes[1];
    await user.clear(nameInput);
    await user.type(nameInput, 'Rum');

    // desiredStock input (type=number) — find it by its current value which defaults to 1
    const desiredStockInput = screen.getByDisplayValue('1');
    await user.clear(desiredStockInput);
    await user.type(desiredStockInput, '3');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalledWith({
        name: 'Rum',
        type: 'SPIRIT',
        desiredStock: 3,
        nameTranslations: null,
      });
    });
  });

  it('submits edit form and calls api.update with correct data', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Vodka');
    await user.clear(nameInput);
    await user.type(nameInput, 'Gin');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockApiUpdate).toHaveBeenCalledWith(1, {
        name: 'Gin',
        type: 'SPIRIT',
        desiredStock: 2,
        nameTranslations: null,
      });
    });
  });

  it('shows custom type input when __OTHER__ is selected in type dropdown', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));

    const typeSelect = screen.getByRole('combobox');
    await user.selectOptions(typeSelect, '__OTHER__');

    expect(screen.getByPlaceholderText('categories.customType')).toBeInTheDocument();
  });

  it('submits create form with __OTHER__ type using custom type value', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));

    const textboxes = screen.getAllByRole('textbox');
    const nameInput = textboxes[1];
    await user.clear(nameInput);
    await user.type(nameInput, 'Tonic');

    const typeSelect = screen.getByRole('combobox');
    await user.selectOptions(typeSelect, '__OTHER__');

    const customTypeInput = screen.getByPlaceholderText('categories.customType');
    await user.type(customTypeInput, 'mixer');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalledWith({
        name: 'Tonic',
        type: 'MIXER',
        desiredStock: 1,
        nameTranslations: null,
      });
    });
  });

  it('opens edit modal with __OTHER__ type when category type is not in catTypes', async () => {
    const unknownTypeCategory = [
      { id: 3, name: 'Water', type: 'UNKNOWN', categoryType: { name: 'UNKNOWN', color: 'gray', nameTranslations: null }, desiredStock: 1, _count: { bottles: 0 } },
    ];
    mockApiList.mockResolvedValue(unknownTypeCategory as never);

    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Water')).toBeInTheDocument());

    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    // Should select __OTHER__ since UNKNOWN is not in catTypes
    const typeSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(typeSelect.value).toBe('__OTHER__');
    expect(screen.getByPlaceholderText('categories.customType')).toHaveValue('UNKNOWN');
  });

  it('shows translation inputs when translations toggle is clicked in category modal', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));

    expect(screen.queryByText('Français')).not.toBeInTheDocument();

    await user.click(screen.getByText('common.translations'));

    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('filters categories by name when typing in search', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => {
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('Grenadine')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('common.search');
    await user.type(searchInput, 'Vod');

    await waitFor(() => {
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.queryByText('Grenadine')).not.toBeInTheDocument();
    });
  });

  it('shows all categories when search is cleared', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('common.search');
    await user.type(searchInput, 'xyz');
    await waitFor(() => {
      expect(screen.queryByText('Vodka')).not.toBeInTheDocument();
    });

    await user.clear(searchInput);
    await waitFor(() => {
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('Grenadine')).toBeInTheDocument();
    });
  });

  it('closes category modal when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categories.add'));
    expect(screen.getByText('categories.add', { selector: 'h2' })).toBeInTheDocument();

    await user.click(screen.getByText('common.cancel'));
    expect(screen.queryByText('categories.add', { selector: 'h2' })).not.toBeInTheDocument();
  });

  // --- Type management modal tests ---

  it('submits type create form and calls ctApi.create', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));
    expect(screen.getByText('categoryTypes.title')).toBeInTheDocument();

    // The type name input is the one with placeholder "GARNISH, MIXER..."
    const typeNameInput = screen.getByPlaceholderText('GARNISH, MIXER...');
    await user.type(typeNameInput, 'garnish');

    await user.click(screen.getByText('common.create'));

    await waitFor(() => {
      expect(mockCtApiCreate).toHaveBeenCalledWith({
        name: 'GARNISH',
        nameTranslations: null,
        color: 'gray',
      });
    });
  });

  it('does not call ctApi.create when type name is empty', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    // Submit without filling in name
    await user.click(screen.getByText('common.create'));

    await waitFor(() => {
      expect(mockCtApiCreate).not.toHaveBeenCalled();
    });
  });

  it('clicks edit on a type and pre-fills the type form', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    // Scope to the type management modal to avoid picking up category table buttons
    const modal = screen.getByText('categoryTypes.title').closest('div.fixed') as HTMLElement;
    const editButtons = within(modal).getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(within(modal).getByText('categoryTypes.edit')).toBeInTheDocument();
    });
    // The name input should be disabled and pre-filled with the type name
    const typeNameInput = within(modal).getByDisplayValue('SPIRIT');
    expect(typeNameInput).toBeDisabled();
  });

  it('submits type edit form and calls ctApi.update', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    const modal = screen.getByText('categoryTypes.title').closest('div.fixed') as HTMLElement;
    const editButtons = within(modal).getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(within(modal).getByText('categoryTypes.edit')).toBeInTheDocument();
    });

    // Translation inputs should be shown (openEditType sets showTypeTranslations to true)
    const frInput = within(modal).getByText('Français').closest('div')!.querySelector('input')!;
    await user.type(frInput, 'Spiritueux');

    await user.click(within(modal).getByText('common.save'));

    await waitFor(() => {
      expect(mockCtApiUpdate).toHaveBeenCalledWith('SPIRIT', {
        nameTranslations: { fr: 'Spiritueux' },
        color: 'blue',
      });
    });
  });

  it('cancels type edit when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    const modal = screen.getByText('categoryTypes.title').closest('div.fixed') as HTMLElement;
    const editButtons = within(modal).getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(within(modal).getByText('categoryTypes.edit')).toBeInTheDocument();
    });

    await user.click(within(modal).getByText('common.cancel'));

    await waitFor(() => {
      expect(within(modal).getByText('categoryTypes.add')).toBeInTheDocument();
    });
  });

  it('calls ctApi.delete when deleting a type with 0 categories', async () => {
    const typesWithZeroCategories = [
      { name: 'SPIRIT', color: 'blue', nameTranslations: null, _count: { categories: 0 } },
    ];
    mockCtApiList.mockResolvedValue(typesWithZeroCategories as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    const modal = screen.getByText('categoryTypes.title').closest('div.fixed') as HTMLElement;
    // With 0 categories the delete button title is 'common.delete' (not 'categoryTypes.cannotDelete')
    const deleteButton = within(modal).getByTitle('common.delete');
    expect(deleteButton).not.toBeDisabled();
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith('categoryTypes.confirmDelete');
    await waitFor(() => {
      expect(mockCtApiDelete).toHaveBeenCalledWith('SPIRIT');
    });
  });

  it('does not call ctApi.delete when confirm returns false', async () => {
    const typesWithZeroCategories = [
      { name: 'SPIRIT', color: 'blue', nameTranslations: null, _count: { categories: 0 } },
    ];
    mockCtApiList.mockResolvedValue(typesWithZeroCategories as never);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    const modal = screen.getByText('categoryTypes.title').closest('div.fixed') as HTMLElement;
    const deleteButton = within(modal).getByTitle('common.delete');
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith('categoryTypes.confirmDelete');
    expect(mockCtApiDelete).not.toHaveBeenCalled();
  });

  it('disables delete button for type with categories > 0', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    // Both SPIRIT and SYRUP have categories count = 1, so delete buttons should be disabled
    const deleteButtons = screen.getAllByTitle('categoryTypes.cannotDelete');
    expect(deleteButtons.length).toBe(2);
    deleteButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('shows type translation inputs when type translations toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    // Only one 'common.translations' button present in the type management modal
    expect(screen.queryByText('Français')).not.toBeInTheDocument();

    await user.click(screen.getByText('common.translations'));

    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('closes type management modal when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));
    expect(screen.getByText('categoryTypes.title')).toBeInTheDocument();

    // The X close button is an svg button without text; find by its position near the title
    const closeButton = screen.getByText('categoryTypes.title')
      .closest('div')!
      .querySelector('button')!;
    await user.click(closeButton);

    expect(screen.queryByText('categoryTypes.title')).not.toBeInTheDocument();
  });

  it('submits type create with translations when filled', async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Vodka')).toBeInTheDocument());

    await user.click(screen.getByText('categoryTypes.manage'));

    const typeNameInput = screen.getByPlaceholderText('GARNISH, MIXER...');
    await user.type(typeNameInput, 'mixer');

    await user.click(screen.getByText('common.translations'));

    const frInput = screen.getByText('Français').closest('div')!.querySelector('input')!;
    await user.type(frInput, 'Mélangeur');

    await user.click(screen.getByText('common.create'));

    await waitFor(() => {
      expect(mockCtApiCreate).toHaveBeenCalledWith({
        name: 'MIXER',
        nameTranslations: { fr: 'Mélangeur' },
        color: 'gray',
      });
    });
  });
});
