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
const mockDelete = vi.mocked(api.delete);

const mockUnits = [
  { id: 1, name: 'Centiliter', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
  { id: 2, name: 'Piece', abbreviation: 'pc', conversionFactorToMl: null, nameTranslations: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(mockUnits as never);
  mockCreate.mockResolvedValue({} as never);
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
});
