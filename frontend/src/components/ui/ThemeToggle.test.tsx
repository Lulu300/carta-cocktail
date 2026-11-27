import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { render, screen } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { THEME_STORAGE_KEY } from '../../utils/theme';
import ThemeToggle from './ThemeToggle';

function renderToggle() {
  // The <meta> that index.html has
  document.head.innerHTML = '<meta name="theme-color" content="#0f0f1a" />';
  return render(<ThemeToggle />);
}

const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('ThemeToggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete document.documentElement.dataset.theme;
  });

  it('is dark and not pressed by default', () => {
    renderToggle();

    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(themeColor()).toBe('#0f0f1a');
  });

  it('switches to the light theme, stores it and moves theme-color, then back', async () => {
    const user = userEvent.setup();
    renderToggle();
    const button = screen.getByRole('button', { name: 'Light theme' });

    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(themeColor()).toBe('#faf7f2');

    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(themeColor()).toBe('#0f0f1a');
  });

  it('starts light when the guest chose it on an earlier visit', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderToggle();

    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('leaves the page dark when it unmounts, as the admin side is always dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { unmount } = renderToggle();

    unmount();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(themeColor()).toBe('#0f0f1a');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('keeps working when the site data is blocked', async () => {
    const user = userEvent.setup();
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(localStorage, 'getItem').mockImplementation(blocked);
    vi.spyOn(localStorage, 'setItem').mockImplementation(blocked);
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('is labelled in French', async () => {
    await i18n.changeLanguage('fr');
    renderToggle();

    expect(screen.getByRole('button', { name: 'Thème clair' })).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = renderToggle();

    expect(await axe(container)).toHaveNoViolations();
  });
});
