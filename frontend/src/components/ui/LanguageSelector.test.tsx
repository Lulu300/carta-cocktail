import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import LanguageSelector from './LanguageSelector';

// Override the global i18n mock for this file to track changeLanguage and vary the detected language
const mockChangeLanguage = vi.fn();
const mockI18n = vi.hoisted(() => ({
  language: 'en' as string | undefined,
  resolvedLanguage: undefined as string | undefined,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { ...mockI18n, changeLanguage: mockChangeLanguage },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockI18n.language = 'en';
  mockI18n.resolvedLanguage = undefined;
});

/** Its name is the hidden label followed by the visible language code. */
function getLanguageButton() {
  return screen.getByRole('button', { name: /^nav\.changeLanguage/ });
}

describe('LanguageSelector', () => {
  it('should use the resolved language when the detected one is regional', () => {
    mockI18n.language = 'en-US';
    mockI18n.resolvedLanguage = 'en';
    render(<LanguageSelector />);
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('should strip the region when no resolved language is available', () => {
    mockI18n.language = 'fr-FR';
    render(<LanguageSelector />);
    expect(screen.getByText('fr')).toBeInTheDocument();
  });

  it('should fall back to English for an unsupported language', () => {
    mockI18n.language = 'de';
    render(<LanguageSelector />);
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('should fall back to English when no language is set', () => {
    mockI18n.language = undefined;
    render(<LanguageSelector />);
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('should render current language button', () => {
    render(<LanguageSelector />);
    // The name keeps the visible code (label in name); CSS uppercases it.
    expect(getLanguageButton()).toHaveAccessibleName('nav.changeLanguage en');
  });

  it('should open dropdown on click', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should call changeLanguage when selecting a language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    await user.click(screen.getByText('Français'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
  });

  it('should close dropdown after selection', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    expect(screen.getByText('Français')).toBeInTheDocument();

    await user.click(screen.getByText('Français'));
    expect(screen.queryByText('Français')).not.toBeInTheDocument();
  });

  it('exposes a menu button whose expanded state follows the menu', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    const button = getLanguageButton();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'nav.language' });
    expect(button).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitemradio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Français/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves the focus into the menu, on the current language, and through it with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    expect(screen.getByRole('menuitemradio', { name: /English/ })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Français/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: /English/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: /Français/ })).toHaveFocus();
  });

  it('closes on Escape and gives the focus back to the button', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    const button = getLanguageButton();

    await user.click(button);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes when the focus leaves the menu with Tab', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    await user.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should show checkmark for current language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    // English is current language, should have checkmark
    const englishButton = screen.getByText('English').closest('button');
    expect(englishButton?.textContent).toContain('✓');
  });
});
