import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
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

describe('AdminLayout accessibility', () => {
  function getMenuButton() {
    return screen.getByRole('button', { name: 'nav.menu' });
  }

  it('starts with a skip link to the main content', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.tab();

    const skipLink = screen.getByRole('link', { name: 'nav.skipToContent' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
    await waitFor(() => expect(mockShortList).toHaveBeenCalled());
  });

  it('marks the current page in the navigation and hides the emojis', async () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'nav.admin' });

    expect(within(nav).getByRole('link', { name: 'nav.categories' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'nav.dashboard' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByText('🏷️')).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(mockShortList).toHaveBeenCalled());
  });

  it('opens the mobile drawer from a named menu button, focusing its first link', async () => {
    const user = userEvent.setup();
    renderLayout();
    const menuButton = getMenuButton();
    const sidebar = screen.getByRole('complementary');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', sidebar.id);
    // Closed on small screens: off screen and out of the tab order.
    expect(sidebar).toHaveClass('max-lg:invisible');

    await user.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar).not.toHaveClass('max-lg:invisible');
    expect(within(sidebar).getByRole('link', { name: /Carta/ })).toHaveFocus();
  });

  it('closes the drawer on Escape and gives the focus back to the menu button', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(getMenuButton());

    await user.keyboard('{Escape}');

    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(getMenuButton()).toHaveFocus();
    expect(screen.getByRole('complementary')).toHaveClass('max-lg:invisible');
  });

  it('closes the drawer when a page is chosen', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(getMenuButton());

    await user.click(screen.getByRole('link', { name: /nav\.units/ }));

    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no serious accessibility violation, drawer open', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await screen.findByText('dashboard.shortageAlert');
    await user.click(getMenuButton());

    expect(await axe(container)).toHaveNoViolations();
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
