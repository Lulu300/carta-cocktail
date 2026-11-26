import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import LanguageSelector from './LanguageSelector';

// The only mock of react-i18next left: the real instance only yields supported codes, so these
// defensive cases (an unsupported or missing language) cannot be reached without faking `i18n`.
const mockI18n = vi.hoisted(() => ({
  language: 'en' as string | undefined,
  resolvedLanguage: undefined as string | undefined,
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { ...mockI18n, changeLanguage: vi.fn() },
  }),
}));

beforeEach(() => {
  mockI18n.language = 'en';
  mockI18n.resolvedLanguage = undefined;
});

describe('LanguageSelector fallbacks', () => {
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
});
