import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import { useShortages } from '../../queries/shortages';
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

/** Stands for an admin page that also reads shortages, like the dashboard. */
function ShortagesReader() {
  const { data } = useShortages();
  return <p>reader:{data?.length ?? 'pending'}</p>;
}

function renderLayout() {
  return render(
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<ShortagesReader />} />
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

  it('reloads the shortages on each route change, even to a page that does not read them', async () => {
    const user = userEvent.setup();
    mockShortList.mockResolvedValueOnce([]);
    renderLayout();
    await waitFor(() => expect(mockShortList).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('link', { name: /nav\.units/ }));

    expect(await screen.findByText('dashboard.shortageAlert')).toBeInTheDocument();
    expect(screen.getByText('units page')).toBeInTheDocument();
    expect(mockShortList).toHaveBeenCalledTimes(2);
  });

  it('joins the request of a page that reloads shortages on the same navigation', async () => {
    const user = userEvent.setup();
    renderLayout();
    await screen.findByText('dashboard.shortageAlert');
    expect(mockShortList).toHaveBeenCalledTimes(1);

    // The page refetches the stale list on mount and the layout invalidates it:
    // one request, not a cancelled one followed by a second
    await user.click(screen.getByRole('link', { name: /nav\.dashboard/ }));

    expect(await screen.findByText('reader:2')).toBeInTheDocument();
    expect(mockShortList).toHaveBeenCalledTimes(2);
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
