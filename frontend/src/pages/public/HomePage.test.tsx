import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import { buildMenu } from '../../test/factories';
import { mockApiPending, mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import type { Menu } from '../../types';
import { axe } from '../../test/axe';
import HomePage from './HomePage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null }),
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ siteSettings: { siteName: 'Chez Lulu', siteIcon: '🍹' } }),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

function mockMenus(menus: Menu[]) {
  mockApiResponse('get', '/api/public/menus', menus);
}

describe('HomePage', () => {
  it('lists the public menus with a pluralized count of cocktails or bottles', async () => {
    mockMenus([
      buildMenu({ slug: 'summer', name: 'Summer', description: 'Fresh drinks', _count: { cocktails: 1, bottles: 0 } }),
      buildMenu({ slug: 'aperitifs', name: 'Apéritifs', type: 'APEROS', _count: { cocktails: 0, bottles: 5 } }),
    ]);

    render(<HomePage />);

    expect(await screen.findByRole('link', { name: /Summer/ })).toHaveAttribute('href', '/menu/summer');
    expect(screen.getByText('Fresh drinks')).toBeInTheDocument();
    expect(screen.getByText('menus.cocktailCount(1)')).toBeInTheDocument();
    expect(screen.getByText('menus.bottleCount(5)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chez Lulu');
  });

  it('counts zero when the API sends no count', async () => {
    mockMenus([buildMenu()]);

    render(<HomePage />);

    expect(await screen.findByText('menus.cocktailCount(0)')).toBeInTheDocument();
  });

  it('says when no menu is published', async () => {
    mockMenus([]);

    render(<HomePage />);

    expect(await screen.findByText('home.noMenus')).toBeInTheDocument();
  });

  it('shows an error with a retry, never "no menus", when the menus cannot be loaded', async () => {
    const user = userEvent.setup();
    mockNetworkError('get', '/api/public/menus');

    render(<HomePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('home.loadError');
    expect(screen.queryByText('home.noMenus')).not.toBeInTheDocument();

    mockMenus([buildMenu({ name: 'Summer' })]);

    await user.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Summer')).toBeInTheDocument();
  });

  it('shows placeholders while the menus load', () => {
    mockApiPending('get', '/api/public/menus');

    render(<HomePage />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('home.noMenus')).not.toBeInTheDocument();
  });
});

describe('HomePage accessibility', () => {
  it('has no serious accessibility violation', async () => {
    mockMenus([buildMenu({ slug: 'summer', name: 'Summer' })]);
    const { container } = render(<HomePage />);
    await screen.findByRole('link', { name: /Summer/ });

    expect(await axe(container)).toHaveNoViolations();
  });
});
