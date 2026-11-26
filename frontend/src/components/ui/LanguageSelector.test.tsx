import { describe, it, expect, vi } from 'vitest';
import i18n from '../../i18n';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import LanguageSelector from './LanguageSelector';
import { LANGUAGE_STORAGE_KEY } from '../../utils/languageChoice';

/** Its name is the hidden label followed by the visible language code. */
function getLanguageButton() {
  return screen.getByRole('button', { name: /^(Change language|Changer de langue)/ });
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
    await i18n.changeLanguage('en-GB');
    render(<LanguageSelector />);
    expect(i18n.resolvedLanguage).toBe('en');

    expect(getLanguageButton()).toHaveAccessibleName('Change language UK');
    expect(flagColors(getLanguageButton())).toContain(UK_BLUE);

    await user.click(getLanguageButton());
    expect(screen.getByRole('menuitemradio', { name: /English \(UK\)/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /English \(US\)/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('should render current language button', () => {
    render(<LanguageSelector />);
    // The name keeps the visible code (label in name); CSS uppercases it.
    expect(getLanguageButton()).toHaveAccessibleName('Change language en');
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

    expect(i18n.language).toBe('en-GB');
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

  it('still switches the language when the browser blocks site data', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    await user.click(getLanguageButton());
    // `Once` on the localStorage mock of src/test/setup.ts: the next tests get it working.
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    await user.click(screen.getByText('English (UK)'));

    expect(localStorage.setItem).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, 'en-GB');
    expect(i18n.language).toBe('en-GB');
  });

  it('should call changeLanguage when selecting a language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(getLanguageButton());
    await user.click(screen.getByText('Français'));

    expect(i18n.language).toBe('fr');
    expect(getLanguageButton()).toHaveAccessibleName('Changer de langue fr');
  });

  it('gives the focus back to the button after a language is chosen from the keyboard', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);
    getLanguageButton().focus();

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(i18n.language).toBe('en-GB');
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
    const menu = screen.getByRole('menu', { name: 'Language' });
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
