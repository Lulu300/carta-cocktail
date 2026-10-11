import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import AdminLayout from './AdminLayout';

vi.mock('../../services/api', () => ({
  shortages: { list: vi.fn() },
}));

const mockLogout = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ siteSettings: { siteName: 'Carta', siteIcon: '' } }),
}));

import { shortages } from '../../services/api';
const mockShortList = vi.mocked(shortages.list);

const twoShortages = [{ category: { id: 1 } }, { category: { id: 2 } }];

function renderLayout() {
  return render(
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<p>dashboard page</p>} />
        <Route path="categories" element={<p>categories page</p>} />
        <Route path="units" element={<p>units page</p>} />
      </Route>
      <Route path="/login" element={<p>login page</p>} />
    </Routes>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/admin/categories');
  mockShortList.mockResolvedValue(twoShortages as never);
});

describe('AdminLayout shortages badge', () => {
  it('shows the number of shortages in the sidebar and the header', async () => {
    renderLayout();

    const navLink = screen.getByRole('link', { name: /nav\.shortages/ });
    expect(await within(navLink).findByText('2')).toBeInTheDocument();
    expect(screen.getByText('dashboard.shortageAlert')).toBeInTheDocument();
  });

  it('shows no badge when there is no shortage', async () => {
    mockShortList.mockResolvedValue([]);
    renderLayout();

    await waitFor(() => expect(mockShortList).toHaveBeenCalled());
    expect(screen.queryByText('dashboard.shortageAlert')).not.toBeInTheDocument();
  });

  it('shows no badge when the request fails', async () => {
    mockShortList.mockRejectedValue(new Error('Network down'));
    renderLayout();

    await waitFor(() => expect(mockShortList).toHaveBeenCalled());
    expect(screen.queryByText('dashboard.shortageAlert')).not.toBeInTheDocument();
  });

  it('does not reload the shortages on a route change: mutations refresh them', async () => {
    const user = userEvent.setup();
    renderLayout();
    await screen.findByText('dashboard.shortageAlert');

    await user.click(screen.getByRole('link', { name: /nav\.units/ }));

    expect(screen.getByText('units page')).toBeInTheDocument();
    expect(mockShortList).toHaveBeenCalledTimes(1);
  });
});

describe('AdminLayout logout', () => {
  it('signs out and goes to the login page', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'nav.logout' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});

describe('AdminLayout app version', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the app version at the bottom of the sidebar', async () => {
    vi.stubEnv('VITE_APP_VERSION', '1.8.0');
    renderLayout();

    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByText('v1.8.0')).toBeInTheDocument();
    await waitFor(() => expect(mockShortList).toHaveBeenCalled());
  });
});
