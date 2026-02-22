import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import DashboardPage from './DashboardPage';

vi.mock('../../services/api', () => ({
  categories: { list: vi.fn() },
  bottles: { list: vi.fn() },
  cocktails: { list: vi.fn() },
  menus: { list: vi.fn() },
  shortages: { list: vi.fn() },
}));

import { categories, bottles, cocktails, menus, shortages } from '../../services/api';

const mockCatList = vi.mocked(categories.list);
const mockBotList = vi.mocked(bottles.list);
const mockCockList = vi.mocked(cocktails.list);
const mockMenuList = vi.mocked(menus.list);
const mockShortList = vi.mocked(shortages.list);

beforeEach(() => {
  vi.clearAllMocks();
  mockCatList.mockResolvedValue([]);
  mockBotList.mockResolvedValue([]);
  mockCockList.mockResolvedValue([]);
  mockMenuList.mockResolvedValue([]);
  mockShortList.mockResolvedValue([]);
});

describe('DashboardPage', () => {
  it('renders the dashboard title', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('dashboard.title')).toBeInTheDocument();
    });
  });

  it('displays stat card counts after loading', async () => {
    mockCatList.mockResolvedValue([{}, {}, {}] as never);
    mockBotList.mockResolvedValue([{}, {}] as never);
    mockCockList.mockResolvedValue([{}, {}, {}, {}] as never);
    mockMenuList.mockResolvedValue([{}] as never);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('shows shortage alert when shortages exist', async () => {
    mockShortList.mockResolvedValue([{ category: {} }] as never);

    render(<DashboardPage />);

    await waitFor(() => {
      const alert = screen.getByText(/dashboard\.shortageAlert/);
      expect(alert).toBeInTheDocument();
    });
  });

  it('does not show shortage alert when no shortages', async () => {
    mockShortList.mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.queryByText(/dashboard\.shortageAlert/)).not.toBeInTheDocument();
    });
  });

  it('stat cards are links to correct admin paths', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));
      expect(hrefs).toContain('/admin/categories');
      expect(hrefs).toContain('/admin/bottles');
      expect(hrefs).toContain('/admin/cocktails');
      expect(hrefs).toContain('/admin/menus');
    });
  });
});
