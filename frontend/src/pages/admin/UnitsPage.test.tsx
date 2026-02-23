import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import UnitsPage from './UnitsPage';

vi.mock('../../services/api', () => ({
  units: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

import { units as api } from '../../services/api';
const mockList = vi.mocked(api.list);
const mockCreate = vi.mocked(api.create);
const mockUpdate = vi.mocked(api.update);
const mockDelete = vi.mocked(api.delete);

const mockUnits = [
  { id: 1, name: 'Centiliter', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
  { id: 2, name: 'Piece', abbreviation: 'pc', conversionFactorToMl: null, nameTranslations: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(mockUnits as never);
  mockCreate.mockResolvedValue({} as never);
  mockUpdate.mockResolvedValue({} as never);
  mockDelete.mockResolvedValue({ message: 'ok' } as never);
});

describe('UnitsPage', () => {
  it('should render title and add button', async () => {
    render(<UnitsPage />);
    expect(screen.getByText('units.title')).toBeInTheDocument();
    expect(screen.getByText('units.add')).toBeInTheDocument();
  });

  it('should display units in table after loading', async () => {
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
      expect(screen.getByText('Piece')).toBeInTheDocument();
    });
  });

  it('should show conversion factor for convertible units', async () => {
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('1 cl = 10 ml')).toBeInTheDocument();
    });
  });

  it('should show "Non convertible" for non-convertible units', async () => {
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Non convertible')).toBeInTheDocument();
    });
  });

  it('should show empty state when no units', async () => {
    mockList.mockResolvedValue([] as never);
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });

  it('should open create modal on add click', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));
    // Modal opens - "units.name" appears in both table header and modal label
    const nameLabels = screen.getAllByText('units.name');
    expect(nameLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('common.save')).toBeInTheDocument();
  });

  it('should call delete with confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it('should not call delete when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle('common.delete');
    await user.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('should open edit modal with pre-filled data including conversionFactorToMl', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    expect(screen.getByText('units.edit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Centiliter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('cl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
  });

  it('should open edit modal for unit with null conversionFactorToMl showing empty conversion input', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Piece')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[1]);

    expect(screen.getByText('units.edit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Piece')).toBeInTheDocument();
    // conversionFactorToMl is null so the number input should be empty (value null)
    const conversionInput = screen.getByPlaceholderText('Laisser vide si non convertible');
    expect(conversionInput).toHaveValue(null);
  });

  it('should submit create form and call api.create with correct data', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    // In the modal: textboxes in order are name, abbreviation (conversion is type=number)
    const textboxes = screen.getAllByRole('textbox');
    // textboxes[0] is the search input, textboxes[1] is name, textboxes[2] is abbreviation
    const nameInput = textboxes[1];
    const abbrevInput = textboxes[2];

    await user.clear(nameInput);
    await user.type(nameInput, 'Milliliter');
    await user.clear(abbrevInput);
    await user.type(abbrevInput, 'ml');

    const conversionInput = screen.getByPlaceholderText('Laisser vide si non convertible');
    await user.clear(conversionInput);
    await user.type(conversionInput, '1');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Milliliter',
        abbreviation: 'ml',
        conversionFactorToMl: 1,
        nameTranslations: null,
      });
    });
  });

  it('should submit create form with empty conversionFactorToMl as null', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    const textboxes = screen.getAllByRole('textbox');
    const nameInput = textboxes[1];
    const abbrevInput = textboxes[2];

    await user.clear(nameInput);
    await user.type(nameInput, 'Piece');
    await user.clear(abbrevInput);
    await user.type(abbrevInput, 'pc');
    // Leave conversion factor empty

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Piece',
        abbreviation: 'pc',
        conversionFactorToMl: null,
        nameTranslations: null,
      });
    });
  });

  it('should submit edit form and call api.update with correct data', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Centiliter');
    await user.clear(nameInput);
    await user.type(nameInput, 'Centilitre');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(1, {
        name: 'Centilitre',
        abbreviation: 'cl',
        conversionFactorToMl: 10,
        nameTranslations: null,
      });
    });
  });

  it('should filter items by name when typing in search', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
      expect(screen.getByText('Piece')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('common.search');
    await user.type(searchInput, 'Cent');

    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
      expect(screen.queryByText('Piece')).not.toBeInTheDocument();
    });
  });

  it('should filter items by abbreviation when typing in search', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Centiliter')).toBeInTheDocument();
      expect(screen.getByText('Piece')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('common.search');
    await user.type(searchInput, 'pc');

    await waitFor(() => {
      expect(screen.getByText('Piece')).toBeInTheDocument();
      expect(screen.queryByText('Centiliter')).not.toBeInTheDocument();
    });
  });

  it('should show translation inputs when translations toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    // Translation inputs not visible yet
    expect(screen.queryByText('Français')).not.toBeInTheDocument();

    await user.click(screen.getByText('common.translations'));

    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should hide translation inputs when translations toggle is clicked again', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    await user.click(screen.getByText('common.translations'));
    expect(screen.getByText('Français')).toBeInTheDocument();

    await user.click(screen.getByText('common.translations'));
    expect(screen.queryByText('Français')).not.toBeInTheDocument();
  });

  it('should submit form with nameTranslations when translations are filled', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    const textboxes = screen.getAllByRole('textbox');
    const nameInput = textboxes[1];
    const abbrevInput = textboxes[2];

    await user.clear(nameInput);
    await user.type(nameInput, 'Gram');
    await user.clear(abbrevInput);
    await user.type(abbrevInput, 'g');

    await user.click(screen.getByText('common.translations'));

    // After typing name 'Gram', the translation placeholders become 'Gram'
    const frInput = screen.getByText('Français').closest('div')!.querySelector('input')!;
    const enInput = screen.getByText('English').closest('div')!.querySelector('input')!;
    await user.type(frInput, 'Gramme');
    await user.type(enInput, 'Gram');

    await user.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Gram',
        abbreviation: 'g',
        conversionFactorToMl: null,
        nameTranslations: { fr: 'Gramme', en: 'Gram' },
      });
    });
  });

  it('should pre-fill translations when editing unit with nameTranslations', async () => {
    const unitWithTranslations = [
      { id: 3, name: 'Litre', abbreviation: 'l', conversionFactorToMl: 1000, nameTranslations: { fr: 'Litre', en: 'Liter' } },
    ];
    mockList.mockResolvedValue(unitWithTranslations as never);
    const user = userEvent.setup();
    render(<UnitsPage />);
    await waitFor(() => {
      expect(screen.getByText('Litre')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle('common.edit');
    await user.click(editButtons[0]);

    // Open translations section
    await user.click(screen.getByText('common.translations'));

    // Multiple inputs may have value 'Litre' (name input + fr translation input)
    const allLitre = screen.getAllByDisplayValue('Litre');
    expect(allLitre.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue('Liter')).toBeInTheDocument();
  });

  it('should close modal when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<UnitsPage />);
    await user.click(screen.getByText('units.add'));

    expect(screen.getByText('common.save')).toBeInTheDocument();

    await user.click(screen.getByText('common.cancel'));

    expect(screen.queryByText('common.save')).not.toBeInTheDocument();
  });
});
