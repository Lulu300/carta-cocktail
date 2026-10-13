import { describe, it, expect, vi, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within } from '../../test/test-utils';
import AdminLayout from '../../components/layout/AdminLayout';
import { AuthProvider } from '../../contexts/AuthContext';
import { SiteSettingsProvider } from '../../contexts/SiteSettingsContext';
import { createQueryClient } from '../../queries/queryClient';
import { buildBottle, buildCategory, buildCocktail, buildMenu, buildShortage } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse } from '../../test/msw/utils';
import DashboardPage from './DashboardPage';

afterEach(() => {
  vi.useRealTimers();
  document.title = '';
});

const getCard = (label: RegExp) => screen.getByRole('link', { name: label });

function mockCounts(counts: { categories: number; bottles: number; cocktails: number; menus: number }) {
  mockApiResponse('get', '/api/categories', Array.from({ length: counts.categories }, () => buildCategory()));
  mockApiResponse('get', '/api/bottles', Array.from({ length: counts.bottles }, () => buildBottle()));
  mockApiResponse('get', '/api/cocktails', Array.from({ length: counts.cocktails }, () => buildCocktail()));
  mockApiResponse('get', '/api/menus', Array.from({ length: counts.menus }, () => buildMenu()));
}

describe('DashboardPage', () => {
  it('shows the counts from the cache when coming back, and reloads them once stale', async () => {
    mockCounts({ categories: 3, bottles: 0, cocktails: 0, menus: 0 });
    const categoriesRequests = captureRequest('get', '/api/categories');
    // Production client: its stale time is what this test is about
    const queryClient = createQueryClient();
    const staleTime = Number(queryClient.getDefaultOptions().queries?.staleTime);
    const getCategoriesCard = () => getCard(/dashboard\.stats\.categories/);

    const firstVisit = render(<DashboardPage />, { queryClient });
    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
    firstVisit.unmount();

    // Back on /admin before the data is stale: counts at once, no spinner, no new request
    const secondVisit = render(<DashboardPage />, { queryClient });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(within(getCategoriesCard()).getByText('3')).toBeInTheDocument();
    expect(categoriesRequests.count()).toBe(1);
    secondVisit.unmount();

    // Once stale, the cached counts still show while the list reloads in the background
    vi.setSystemTime(Date.now() + staleTime + 1_000);
    render(<DashboardPage />, { queryClient });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(within(getCategoriesCard()).getByText('3')).toBeInTheDocument();
    await waitFor(() => expect(categoriesRequests.count()).toBe(2));

    queryClient.clear();
  });

  it('shows the count of each list on its card, linked to its admin page', async () => {
    mockCounts({ categories: 3, bottles: 2, cocktails: 4, menus: 1 });

    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'dashboard.title' })).toBeInTheDocument();
    const cards = [
      { label: /dashboard\.stats\.categories/, count: '3', path: '/admin/categories' },
      { label: /dashboard\.stats\.bottles/, count: '2', path: '/admin/bottles' },
      { label: /dashboard\.stats\.cocktails/, count: '4', path: '/admin/cocktails' },
      { label: /dashboard\.stats\.menus/, count: '1', path: '/admin/menus' },
    ];
    for (const card of cards) {
      expect(await within(getCard(card.label)).findByText(card.count)).toBeInTheDocument();
      expect(getCard(card.label)).toHaveAttribute('href', card.path);
    }
  });

  it('links to the shortages page when some categories are short', async () => {
    mockApiResponse('get', '/api/shortages', [buildShortage(), buildShortage()]);

    render(<DashboardPage />);

    const alert = await screen.findByRole('link', { name: /dashboard\.shortageAlert/ });
    expect(alert).toHaveAttribute('href', '/admin/shortages');
  });

  it('does not show the shortage alert when nothing is short', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
    expect(screen.queryByText(/dashboard\.shortageAlert/)).not.toBeInTheDocument();
  });

  it('shows a spinner, not 0, on each card while its count loads', () => {
    for (const path of ['/api/categories', '/api/bottles', '/api/cocktails', '/api/menus']) {
      mockApiPending('get', path);
    }

    render(<DashboardPage />);

    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a dash and an error on the card whose request failed, never 0', async () => {
    mockCounts({ categories: 3, bottles: 0, cocktails: 0, menus: 0 });
    mockApiError('get', '/api/bottles', 500, 'Database unavailable');

    render(<DashboardPage />);

    const bottlesCard = getCard(/dashboard\.stats\.bottles/);
    expect(await within(bottlesCard).findByText('common.error')).toBeInTheDocument();
    expect(within(bottlesCard).getByText('–')).toBeInTheDocument();
    expect(within(bottlesCard).queryByText('0')).not.toBeInTheDocument();
    expect(within(getCard(/dashboard\.stats\.categories/)).getByText('3')).toBeInTheDocument();
  });

  it('sends a single shortages request when rendered inside AdminLayout', async () => {
    mockApiResponse('get', '/api/shortages', [buildShortage()]);
    const shortagesRequests = captureRequest('get', '/api/shortages');

    // The providers of main.tsx: the layout reads the session and the site settings
    render(
      <AuthProvider>
        <SiteSettingsProvider>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/" element={<DashboardPage />} />
            </Route>
          </Routes>
        </SiteSettingsProvider>
      </AuthProvider>,
    );

    // Layout badge and dashboard alert both show the count from the same request
    await waitFor(() => {
      expect(screen.getAllByText(/dashboard\.shortageAlert/)).toHaveLength(2);
    });
    expect(shortagesRequests.count()).toBe(1);
    await waitFor(() => expect(document.title).toBe('Carta'));
  });
});
