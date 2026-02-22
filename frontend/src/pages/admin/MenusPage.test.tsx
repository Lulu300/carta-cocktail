import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import MenusPage from './MenusPage';

vi.mock('../../services/api', () => ({
  menus: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

import { menus as api } from '../../services/api';
const mockList = vi.mocked(api.list);
const mockCreate = vi.mocked(api.create);
const mockDelete = vi.mocked(api.delete);

const mockMenus = [
  { id: 1, name: 'Apéritifs', slug: 'aperitifs', type: 'APEROS', description: null, isPublic: true, createdAt: '2024-01-01', updatedAt: '2024-01-01', _count: { cocktails: 0, bottles: 5 } },
  { id: 2, name: 'Digestifs', slug: 'digestifs', type: 'DIGESTIFS', description: null, isPublic: false, createdAt: '2024-01-01', updatedAt: '2024-01-01', _count: { cocktails: 0, bottles: 2 } },
  { id: 3, name: 'Summer Menu', slug: 'summer', type: 'COCKTAILS', description: 'Summer cocktails', isPublic: true, createdAt: '2024-01-01', updatedAt: '2024-01-01', _count: { cocktails: 8, bottles: 0 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(mockMenus as never);
  mockCreate.mockResolvedValue({} as never);
  mockDelete.mockResolvedValue({ message: 'ok' } as never);
});

describe('MenusPage', () => {
  it('should render title and add button', async () => {
    render(<MenusPage />);
    expect(screen.getByText('menus.title')).toBeInTheDocument();
    expect(screen.getByText('menus.add')).toBeInTheDocument();
  });

  it('should display menus in table after loading', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      // "Apéritifs" appears in both <a> (name) and <span> (type badge)
      expect(screen.getAllByText('Apéritifs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Digestifs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Summer Menu')).toBeInTheDocument();
    });
  });

  it('should show menu type badges', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      expect(screen.getByText('Cocktails')).toBeInTheDocument();
      expect(screen.getByText('Apéritifs', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByText('Digestifs', { selector: 'span' })).toBeInTheDocument();
    });
  });

  it('should show public/private status', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      const yesLabels = screen.getAllByText('common.yes');
      const noLabels = screen.getAllByText('common.no');
      expect(yesLabels.length).toBe(2); // aperitifs + summer
      expect(noLabels.length).toBe(1); // digestifs
    });
  });

  it('should show content counts', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      expect(screen.getByText('5 bouteille(s)')).toBeInTheDocument();
      expect(screen.getByText('8 cocktail(s)')).toBeInTheDocument();
    });
  });

  it('should show default menu labels', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      const defaults = screen.getAllByText('(par défaut)');
      expect(defaults.length).toBe(2); // aperitifs + digestifs
    });
  });

  it('should not show delete button for default menus', async () => {
    render(<MenusPage />);
    await waitFor(() => {
      expect(screen.getByText('Summer Menu')).toBeInTheDocument();
    });
    // Only summer menu (non-default) should have delete
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('common.delete');
      expect(deleteButtons.length).toBe(1);
    });
  });

  it('should open create modal on add click', async () => {
    const user = userEvent.setup();
    render(<MenusPage />);
    await user.click(screen.getByText('menus.add'));
    // "menus.slug" and "menus.isPublic" appear in both table header and modal
    const slugLabels = screen.getAllByText('menus.slug');
    expect(slugLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('common.save')).toBeInTheDocument();
  });

  it('should call delete with confirm for non-default menu', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<MenusPage />);
    await waitFor(() => {
      expect(screen.getByText('Summer Menu')).toBeInTheDocument();
    });
    const deleteButton = screen.getByTitle('common.delete');
    await user.click(deleteButton);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(3);
  });

  it('should show empty state when no menus', async () => {
    mockList.mockResolvedValue([] as never);
    render(<MenusPage />);
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });
});
