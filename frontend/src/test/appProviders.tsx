import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { SiteSettingsProvider } from '../contexts/SiteSettingsContext';

// Kept apart from test-utils, like feedback.tsx: the contexts load services/api and
// the real i18n setup, which tests that mock react-i18next without initReactI18next
// cannot import.

/**
 * The session and site settings providers of main.tsx, for a page that reads them.
 * They call the fake backend: GET /api/auth/me when a token is stored, and
 * GET /api/public/settings always.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SiteSettingsProvider>{children}</SiteSettingsProvider>
    </AuthProvider>
  );
}
