import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import LanguageSelector from './LanguageSelector';

// Override the global i18n mock for this file to track changeLanguage
const mockChangeLanguage = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: mockChangeLanguage },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LanguageSelector', () => {
  it('should render current language button', () => {
    render(<LanguageSelector />);
    const button = screen.getByLabelText('Change language');
    expect(button).toBeInTheDocument();
    // CSS handles uppercase, text content is lowercase 'en'
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('should open dropdown on click', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByLabelText('Change language'));
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should call changeLanguage when selecting a language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByLabelText('Change language'));
    await user.click(screen.getByText('Français'));

    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
  });

  it('should close dropdown after selection', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByLabelText('Change language'));
    expect(screen.getByText('Français')).toBeInTheDocument();

    await user.click(screen.getByText('Français'));
    expect(screen.queryByText('Français')).not.toBeInTheDocument();
  });

  it('should show checkmark for current language', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByLabelText('Change language'));
    // English is current language, should have checkmark
    const englishButton = screen.getByText('English').closest('button');
    expect(englishButton?.textContent).toContain('✓');
  });
});
