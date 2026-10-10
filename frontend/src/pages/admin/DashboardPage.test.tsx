import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within } from '../../test/test-utils';
import AdminLayout from '../../components/layout/AdminLayout';
import { createQueryClient } from '../../queries/queryClient';
import DashboardPage from './DashboardPage';

vi.mock('../../services/api', () => ({
  // Imported by the production query client's retry rule
  ApiError: class ApiError extends Error {},
  categories: { list: vi.fn() },
  bottles: { list: vi.fn() },
  cocktails: { list: vi.fn() },
  menus: { list: vi.fn() },
  shortages: { list: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ siteSettings: { siteName: 'Carta', siteIcon: '' } }),
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

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage', () => {
  it('shows the counts from the cache when coming back, and reloads them once stale', async () => {
    mockCatList.mockResolvedValue([{}, {}, {}] as never);
    // Production client: the 30 s stale time is what this test is about
    const queryClient = createQueryClient();
    const getCategoriesCard = () => screen.getByRole('link', { name: /dashboard\.stats\.categories/ });

    const firstVisit = render(<DashboardPage />, { queryClient });
    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
    firstVisit.unmount();

    // Back on /admin within 30 s: counts at once, no spinner, no new request
    const secondVisit = render(<DashboardPage />, { queryClient });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(within(getCategoriesCard()).getByText('3')).toBeInTheDocument();
    expect(mockCatList).toHaveBeenCalledTimes(1);
    secondVisit.unmount();

    // After 30 s the cached counts still show while the list reloads in the background
    vi.setSystemTime(Date.now() + 31_000);
    render(<DashboardPage />, { queryClient });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(within(getCategoriesCard()).getByText('3')).toBeInTheDocument();
    await waitFor(() => expect(mockCatList).toHaveBeenCalledTimes(2));

    queryClient.clear();
  });

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

  it('shows a spinner, not 0, on each card while its count loads', () => {
    mockCatList.mockReturnValue(new Promise(() => {}));
    mockBotList.mockReturnValue(new Promise(() => {}));
    mockCockList.mockReturnValue(new Promise(() => {}));
    mockMenuList.mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />);

    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a dash and an error on the card whose request failed, never 0', async () => {
    mockCatList.mockResolvedValue([{}, {}, {}] as never);
    mockBotList.mockRejectedValue(new Error('Network down'));

    render(<DashboardPage />);

    const bottlesCard = screen.getByRole('link', { name: /dashboard\.stats\.bottles/ });
    expect(await within(bottlesCard).findByText('common.error')).toBeInTheDocument();
    expect(within(bottlesCard).getByText('–')).toBeInTheDocument();
    expect(within(bottlesCard).queryByText('0')).not.toBeInTheDocument();

    const categoriesCard = screen.getByRole('link', { name: /dashboard\.stats\.categories/ });
    expect(within(categoriesCard).getByText('3')).toBeInTheDocument();
  });

  it('sends a single shortages request when rendered inside AdminLayout', async () => {
    mockShortList.mockResolvedValue([{ category: {} }] as never);

    render(
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
      </Routes>,
    );

    // Layout badge and dashboard alert both show the count from the same request
    await waitFor(() => {
      expect(screen.getAllByText(/dashboard\.shortageAlert/)).toHaveLength(2);
    });
    expect(mockShortList).toHaveBeenCalledTimes(1);
  });
});
