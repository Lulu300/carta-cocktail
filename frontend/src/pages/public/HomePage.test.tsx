import { beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import { AppProviders } from '../../test/appProviders';
import { buildPublicMenuSummary, buildSiteSettings } from '../../test/factories';
import {
  mockApiPending,
  mockApiResponse,
  mockNetworkError,
  mockRateLimited,
} from '../../test/msw/utils';
import type { Menu } from '../../types';
import { axe } from '../../test/axe';
import HomePage from './HomePage';

function mockMenus(menus: Menu[]) {
  mockApiResponse('get', '/api/public/menus', menus);
}

/** The home page of a guest: no stored token, the site settings from the backend. */
function renderHome() {
  return render(
    <AppProviders>
      <HomePage />
    </AppProviders>,
  );
}

beforeEach(() => {
  mockApiResponse(
    'get',
    '/api/public/settings',
    buildSiteSettings({ siteName: 'Chez Lulu', siteIcon: '🍹' }),
  );
});

describe('HomePage', () => {
  it('lists the public menus with a pluralized count of cocktails or bottles', async () => {
    mockMenus([
      buildPublicMenuSummary({
        slug: 'summer',
        name: 'Summer',
        description: 'Fresh drinks',
        _count: { cocktails: 1, bottles: 0 },
      }),
      buildPublicMenuSummary({
        slug: 'aperitifs',
        name: 'Apéritifs',
        type: 'APEROS',
        _count: { cocktails: 0, bottles: 5 },
      }),
    ]);

    renderHome();

    expect(await screen.findByRole('link', { name: /Summer/ })).toHaveAttribute(
      'href',
      '/menu/summer',
    );
    expect(screen.getByText('Fresh drinks')).toBeInTheDocument();
    expect(screen.getByText('1 cocktail')).toBeInTheDocument();
    expect(screen.getByText('5 bottles')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Chez Lulu/ })).toBeInTheDocument();
  });

  it('counts zero when the API sends no count', async () => {
    mockMenus([buildPublicMenuSummary()]);

    renderHome();

    expect(await screen.findByText('0 cocktails')).toBeInTheDocument();
  });

  it('says when no menu is published', async () => {
    mockMenus([]);

    renderHome();

    expect(await screen.findByText('No menus available at the moment')).toBeInTheDocument();
  });

  it('shows an error with a retry, never "no menus", when the menus cannot be loaded', async () => {
    const user = userEvent.setup();
    mockNetworkError('get', '/api/public/menus');

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the menus');
    expect(screen.queryByText('No menus available at the moment')).not.toBeInTheDocument();

    mockMenus([buildPublicMenuSummary({ name: 'Summer' })]);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Summer')).toBeInTheDocument();
  });

  it("brings back the bar's name with the menus when the guest retries after a 429", async () => {
    const user = userEvent.setup();
    mockRateLimited('get', '/api/public/settings', 60);
    mockRateLimited('get', '/api/public/menus', 60);

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the menus');
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('');

    mockApiResponse(
      'get',
      '/api/public/settings',
      buildSiteSettings({ siteName: 'Chez Lulu', siteIcon: '🍹' }),
    );
    mockMenus([buildPublicMenuSummary({ name: 'Summer' })]);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Summer')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Chez Lulu/ })).toHaveTextContent(
      '🍹',
    );
  });

  it('shows placeholders while the menus load', () => {
    mockApiPending('get', '/api/public/menus');

    renderHome();

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No menus available at the moment')).not.toBeInTheDocument();
  });
});

describe('HomePage accessibility', () => {
  it('has no serious accessibility violation', async () => {
    mockMenus([buildPublicMenuSummary({ slug: 'summer', name: 'Summer' })]);
    const { container } = renderHome();
    await screen.findByRole('link', { name: /Summer/ });

    expect(await axe(container)).toHaveNoViolations();
  });
});
