import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
import PublicLayout from './PublicLayout';

const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ siteSettings: { siteName: 'Chez Lulu', siteIcon: '🍹' } }),
}));

vi.mock('../ui/LanguageSelector', () => ({
  default: () => <button type="button">language</button>,
}));

describe('PublicLayout', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('keeps the sign-in link out of the header, in a discreet footer with the site name', () => {
    render(<PublicLayout />);

    const header = screen.getByRole('banner');
    const footer = screen.getByRole('contentinfo');
    expect(within(header).queryByRole('link', { name: 'nav.login' })).not.toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'nav.login' })).toHaveAttribute('href', '/login');
    expect(within(footer).getByText('Chez Lulu')).toBeInTheDocument();
  });

  it('gives a signed-in admin a dashboard link instead of the sign-in link', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'admin@carta.local' } });

    render(<PublicLayout />);

    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'nav.dashboard' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('link', { name: 'nav.login' })).not.toBeInTheDocument();
  });

  it('links the site name in the header to the home page', () => {
    render(<PublicLayout />);

    expect(within(screen.getByRole('banner')).getByRole('link', { name: /Chez Lulu/ })).toHaveAttribute('href', '/');
  });

  it('starts with a skip link to the main content, and puts the header links in a navigation landmark', async () => {
    const user = userEvent.setup();
    render(<PublicLayout />);

    await user.tab();

    const skipLink = screen.getByRole('link', { name: 'nav.skipToContent' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
    // The link moves the focus to the main content, and is never printed.
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(skipLink).toHaveClass('print:hidden');
    const nav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'nav.main' });
    expect(within(nav).getByRole('link', { name: /Chez Lulu/ })).toBeInTheDocument();
  });

  it('hides the site icon from screen readers', () => {
    render(<PublicLayout />);

    expect(within(screen.getByRole('banner')).getByText('🍹')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no serious accessibility violation', async () => {
    const { container } = render(<PublicLayout />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
