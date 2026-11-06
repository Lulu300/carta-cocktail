import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { AppProviders } from '../../test/appProviders';
import { buildShortage, buildSiteSettings } from '../../test/factories';
import { ADMIN_USER } from '../../test/msw/handlers';
import { captureRequest, mockApiError, mockApiResponse, type CapturedRequest } from '../../test/msw/utils';
import AdminLayout from './AdminLayout';

const twoShortages = [buildShortage(), buildShortage()];

let shortagesRequests: CapturedRequest;

/** Renders the layout once the test has set its answers: the shortages requests are recorded from here. */
function renderLayout() {
  shortagesRequests = captureRequest('get', '/api/shortages');
  return render(
    <AppProviders>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>dashboard page</p>} />
          <Route path="categories" element={<p>categories page</p>} />
          <Route path="units" element={<p>units page</p>} />
        </Route>
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </AppProviders>,
  );
}

/** Waits for the requests of the layout: the session, the site settings and the shortages. */
async function waitForLayoutData() {
  await waitFor(() => expect(document.title).toBe('Chez Lulu'));
  await waitFor(() => expect(shortagesRequests.count()).toBe(1));
  await screen.findByRole('link', { name: /Chez Lulu/ });
}

beforeEach(() => {
  window.history.pushState({}, '', '/admin/categories');
  localStorage.setItem('token', 'admin-token');
  mockApiResponse('get', '/api/auth/me', ADMIN_USER);
  mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName: 'Chez Lulu' }));
  mockApiResponse('get', '/api/shortages', twoShortages);
});

afterEach(() => {
  document.title = '';
});

describe('AdminLayout shortages badge', () => {
  it('shows the number of shortages in the sidebar and the header', async () => {
    renderLayout();

    const navLink = screen.getByRole('link', { name: /nav\.shortages/ });
    expect(await within(navLink).findByText('2')).toBeInTheDocument();
    expect(screen.getByText('dashboard.shortageAlert')).toBeInTheDocument();
  });

  it('shows no badge when there is no shortage', async () => {
    mockApiResponse('get', '/api/shortages', []);
    renderLayout();

    await waitForLayoutData();
    expect(screen.queryByText('dashboard.shortageAlert')).not.toBeInTheDocument();
  });

  it('shows no badge when the request fails', async () => {
    mockApiError('get', '/api/shortages', 500, 'Database unavailable');
    renderLayout();

    await waitForLayoutData();
    expect(screen.queryByText('dashboard.shortageAlert')).not.toBeInTheDocument();
  });

  it('does not reload the shortages on a route change: mutations refresh them', async () => {
    const user = userEvent.setup();
    renderLayout();
    await screen.findByText('dashboard.shortageAlert');

    await user.click(screen.getByRole('link', { name: /nav\.units/ }));

    expect(screen.getByText('units page')).toBeInTheDocument();
    expect(shortagesRequests.count()).toBe(1);
  });
});

describe('AdminLayout logout', () => {
  it('signs out and goes to the login page', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();

    await user.click(screen.getByRole('button', { name: 'nav.logout' }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
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
    await waitForLayoutData();
  });

  it('marks the current page in the navigation and hides the emojis', async () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'nav.admin' });

    expect(within(nav).getByRole('link', { name: 'nav.categories' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'nav.dashboard' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByText('🏷️')).toHaveAttribute('aria-hidden', 'true');
    await waitForLayoutData();
  });

  it('opens the mobile drawer from a named menu button, focusing its first link', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();
    const menuButton = getMenuButton();
    const sidebar = screen.getByRole('complementary');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', sidebar.id);
    // Closed on small screens: off screen and out of the tab order.
    expect(sidebar).toHaveClass('max-lg:invisible');

    await user.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar).not.toHaveClass('max-lg:invisible');
    expect(within(sidebar).getByRole('link', { name: /Chez Lulu/ })).toHaveFocus();
  });

  // jsdom runs no transition: the real-browser cause of a lost focus is the
  // visibility transition, so the test checks it is not delayed on opening.
  it('shows the drawer at once on opening and hides it only after the slide on closing', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('visibility_0s_200ms');

    await user.click(getMenuButton());

    expect(sidebar.className).toContain('[transition:translate_200ms,visibility_0s]');
    expect(sidebar.className).not.toContain('visibility_0s_200ms');
  });

  it('gives the focus back to the menu button when the overlay is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await waitForLayoutData();
    await user.click(getMenuButton());

    await user.click(container.querySelector('.bg-black\\/50')!);

    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(getMenuButton()).toHaveFocus();
  });

  it('lets the skip link move the focus to the main content', async () => {
    renderLayout();
    await waitForLayoutData();
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('closes the drawer on Escape and gives the focus back to the menu button', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();
    await user.click(getMenuButton());

    await user.keyboard('{Escape}');

    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(getMenuButton()).toHaveFocus();
    expect(screen.getByRole('complementary')).toHaveClass('max-lg:invisible');
  });

  it('closes the drawer when a page is chosen', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();
    await user.click(getMenuButton());

    await user.click(screen.getByRole('link', { name: /nav\.units/ }));

    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no serious accessibility violation, drawer open', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await waitForLayoutData();
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
    await waitForLayoutData();
  });
});
