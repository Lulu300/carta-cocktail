import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lazy, Suspense } from 'react';
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

function BrokenPage(): never {
  throw new Error('render failed');
}

// A page whose chunk cannot be loaded, behind a Suspense like the one of App.tsx
const MissingChunkPage = lazy(() => Promise.reject(new Error('chunk missing')));

function renderLayoutWithBrokenPages() {
  return render(
    <AppProviders>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>dashboard page</p>} />
          <Route path="units" element={<p>units page</p>} />
          <Route path="categories" element={<BrokenPage />} />
          <Route path="bottles" element={<Suspense fallback={null}><MissingChunkPage /></Suspense>} />
        </Route>
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

    const navLink = screen.getByRole('link', { name: /Shortages/ });
    expect(await within(navLink).findByText('2')).toBeInTheDocument();
    expect(screen.getByText('2 shortages detected')).toBeInTheDocument();
  });

  it('shows no badge when there is no shortage', async () => {
    mockApiResponse('get', '/api/shortages', []);
    renderLayout();

    await waitForLayoutData();
    expect(screen.queryByText('2 shortages detected')).not.toBeInTheDocument();
  });

  it('shows no badge when the request fails', async () => {
    mockApiError('get', '/api/shortages', 500, 'Database unavailable');
    renderLayout();

    await waitForLayoutData();
    expect(screen.queryByText('2 shortages detected')).not.toBeInTheDocument();
  });

  it('does not reload the shortages on a route change: mutations refresh them', async () => {
    const user = userEvent.setup();
    renderLayout();
    await screen.findByText('2 shortages detected');

    await user.click(screen.getByRole('link', { name: /Units/ }));

    expect(screen.getByText('units page')).toBeInTheDocument();
    expect(shortagesRequests.count()).toBe(1);
  });
});

describe('AdminLayout logout', () => {
  it('signs out and goes to the login page', async () => {
    const user = userEvent.setup();
    renderLayout();
    await waitForLayoutData();

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('AdminLayout accessibility', () => {
  function getMenuButton() {
    return screen.getByRole('button', { name: 'Navigation menu' });
  }

  it('starts with a skip link to the main content', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.tab();

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
    await waitForLayoutData();
  });

  it('marks the current page in the navigation and hides the emojis', async () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Administration' });

    expect(within(nav).getByRole('link', { name: 'Categories' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
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

    await user.click(screen.getByRole('link', { name: /Units/ }));

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

describe('AdminLayout upgrade notice', () => {
  it('shows the notice above the page, and keeps it from one page to the next', async () => {
    const user = userEvent.setup();
    mockApiResponse('get', '/api/system/upgrade-notice', {
      from: '1.5.0',
      to: '1.6.0',
      actions: [{ version: '1.6.0', when: 'after', action: 'Check the backend log.' }],
    });
    renderLayout();

    expect(await screen.findByRole('heading', { name: /^Upgrade from v.+ to v.+$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Units/ }));

    expect(await screen.findByText('units page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Upgrade from v.+ to v.+$/ })).toBeInTheDocument();
  });
});

// jsdom computes no layout: these classes keep a wide table from stretching the page (checked in a browser)
describe('AdminLayout width', () => {
  it('keeps the sidebar at its width and lets the content column shrink below its content', async () => {
    renderLayout();
    await waitForLayoutData();

    expect(screen.getByRole('navigation', { name: 'Administration' }).closest('aside')).toHaveClass('lg:shrink-0');
    expect(screen.getByRole('main').parentElement).toHaveClass('min-w-0');
  });
});

describe('AdminLayout page error', () => {
  beforeEach(() => {
    // React reports every error a boundary catches on the console
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['throws while rendering', '/admin/categories'],
    ['cannot be loaded', '/admin/bottles'],
  ])('keeps the sidebar and the header when a page %s', async (_case, path) => {
    window.history.pushState({}, '', path);
    const { container } = renderLayoutWithBrokenPages();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This page could not be displayed');
    expect(alert).toHaveFocus();
    expect(screen.getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(alert);
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
    // The site name of the sidebar is empty until the settings arrive
    await screen.findByRole('link', { name: /Chez Lulu/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('goes on with another page from the sidebar, without reloading', async () => {
    window.history.pushState({}, '', '/admin/categories');
    renderLayoutWithBrokenPages();
    await screen.findByRole('alert');

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Administration' })).getByRole('link', { name: /Units/ }));

    expect(await screen.findByText('units page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('returns to the dashboard with the link of the error screen', async () => {
    window.history.pushState({}, '', '/admin/categories');
    renderLayoutWithBrokenPages();
    await screen.findByRole('alert');

    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Dashboard' }));

    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
