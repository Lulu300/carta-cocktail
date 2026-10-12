import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import { bottleMenu, cocktailMenu } from '../../test/publicMenuFixtures';
import { axe } from '../../test/axe';
import HomePage from './HomePage';

vi.mock('../../services/api', () => ({
  publicApi: { listMenus: vi.fn() },
}));

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

import { publicApi } from '../../services/api';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the public menus with a pluralized count of cocktails or bottles', async () => {
    vi.mocked(publicApi.listMenus).mockResolvedValue([
      cocktailMenu([], { slug: 'summer', name: 'Summer', description: 'Fresh drinks', _count: { cocktails: 1, bottles: 0 } }),
      bottleMenu([], { id: 3, slug: 'aperitifs', name: 'Apéritifs', _count: { cocktails: 0, bottles: 5 } }),
    ]);

    render(<HomePage />);

    expect(await screen.findByRole('link', { name: /Summer/ })).toHaveAttribute('href', '/menu/summer');
    expect(screen.getByText('Fresh drinks')).toBeInTheDocument();
    expect(screen.getByText('home.cocktailCount(1)')).toBeInTheDocument();
    expect(screen.getByText('home.bottleCount(5)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chez Lulu');
  });

  it('counts zero when the API sends no count', async () => {
    vi.mocked(publicApi.listMenus).mockResolvedValue([cocktailMenu([])]);

    render(<HomePage />);

    expect(await screen.findByText('home.cocktailCount(0)')).toBeInTheDocument();
  });

  it('says when no menu is published', async () => {
    vi.mocked(publicApi.listMenus).mockResolvedValue([]);

    render(<HomePage />);

    expect(await screen.findByText('home.noMenus')).toBeInTheDocument();
  });

  it('shows an error with a retry, never "no menus", when the menus cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(publicApi.listMenus).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.mocked(publicApi.listMenus).mockResolvedValueOnce([cocktailMenu([], { name: 'Summer' })]);

    render(<HomePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('home.loadError');
    expect(screen.queryByText('home.noMenus')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByText('Summer')).toBeInTheDocument();
  });

  it('shows placeholders while the menus load', () => {
    vi.mocked(publicApi.listMenus).mockReturnValue(new Promise(() => {}));

    render(<HomePage />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('home.noMenus')).not.toBeInTheDocument();
  });
});

describe('HomePage accessibility', () => {
  it('has no serious accessibility violation', async () => {
    vi.mocked(publicApi.listMenus).mockResolvedValue([cocktailMenu([], { slug: 'summer', name: 'Summer' })]);
    const { container } = render(<HomePage />);
    await screen.findByRole('link', { name: /Summer/ });

    expect(await axe(container)).toHaveNoViolations();
  });
});
