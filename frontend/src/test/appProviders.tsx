import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { SiteSettingsProvider } from '../contexts/SiteSettingsContext';

// Kept apart from test-utils, like feedback.tsx: only the pages that read the session or the
// site settings need these contexts, and with them the requests they send to the fake backend.

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
