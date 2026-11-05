import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import LanguageSelector from './LanguageSelector';
import { LANGUAGE_STORAGE_KEY } from '../../utils/languageChoice';

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

/** The colors of the flag drawn in an element: flags are hidden from assistive technologies. */
function flagColors(element: HTMLElement) {
  return Array.from(element.querySelectorAll('svg [fill]'), (shape) => shape.getAttribute('fill'));
}

const US_BLUE = '#3c3b6e';
const UK_BLUE = '#012169';

describe('LanguageSelector', () => {
  it('shows English (UK) from the chosen code, although its messages resolve to en', async () => {
    const user = userEvent.setup();
    mockI18n.language = 'en-GB';
    mockI18n.resolvedLanguage = 'en';
    render(<LanguageSelector />);

    expect(getLanguageButton()).toHaveAccessibleName('nav.changeLanguage UK');
    expect(flagColors(getLanguageButton())).toContain(UK_BLUE);

    await user.click(getLanguageButton());
    expect(screen.getByRole('menuitemradio', { name: /English \(UK\)/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /English \(US\)/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('should reduce an unsupported regional code to its base language', () => {
    mockI18n.language = 'en-US';
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
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Français', 'English (US)✓', 'English (UK)',
    ]);
  });

  it('draws the US flag for English (US) and the British flag for English (UK)', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    expect(flagColors(getLanguageButton())).toContain(US_BLUE);

    await user.click(getLanguageButton());

    const usItem = screen.getByRole('menuitemradio', { name: /English \(US\)/ });
    const ukItem = screen.getByRole('menuitemradio', { name: /English \(UK\)/ });
    expect(flagColors(usItem)).toContain(US_BLUE);
    expect(flagColors(usItem)).not.toContain(UK_BLUE);
    expect(flagColors(ukItem)).toContain(UK_BLUE);
    expect(flagColors(ukItem)).not.toContain(US_BLUE);
    expect(ukItem).toHaveAttribute('lang', 'en-GB');
  });

  it('switches to English (UK)', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    await user.click(screen.getByText('English (UK)'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('en-GB');
  });

  // The detector stores nothing: the selector keeps the choice for the next visits.
  it('stores the picked language, and only a picked one', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    await user.click(getLanguageButton());
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByText('English (UK)'));

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-GB');
  });

  it('should call changeLanguage when selecting a language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    await user.click(screen.getByText('Français'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
  });

  it('gives the focus back to the button after a language is chosen from the keyboard', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    getLanguageButton().focus();

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(mockChangeLanguage).toHaveBeenCalledWith('en-GB');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(getLanguageButton()).toHaveFocus();
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
    expect(screen.getByRole('menuitemradio', { name: /English \(US\)/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /English \(UK\)/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: /Français/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves the focus into the menu, on the current language, and through it with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    expect(screen.getByRole('menuitemradio', { name: /English \(US\)/ })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /English \(UK\)/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Français/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: /English \(UK\)/ })).toHaveFocus();
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
    // English (US) is the current language, it should have the checkmark
    const englishButton = screen.getByText('English (US)').closest('button');
    expect(englishButton?.textContent).toContain('✓');
  });
});
