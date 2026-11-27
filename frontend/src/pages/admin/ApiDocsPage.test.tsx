import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { render, screen, waitFor } from '../../test/test-utils';
import { AppProviders } from '../../test/appProviders';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { buildSiteSettings } from '../../test/factories';
import { captureRequest, mockApiError, mockApiResponse } from '../../test/msw/utils';
import { OPENAPI_DOCUMENT } from '../../test/msw/handlers';
import ApiDocsPage from './ApiDocsPage';

/** Shown once the providers have their answers: GET /api/auth/me and GET /api/public/settings. */
function ProvidersSettled() {
  const { isLoading } = useAuth();
  const { siteSettings } = useSiteSettings();
  const settled = !isLoading && siteSettings.siteName === buildSiteSettings().siteName;
  return settled ? <span data-testid="providers-settled" /> : null;
}

/**
 * Renders the page and waits for the providers: a test that ended before their answers would let
 * them update React after jsdom is torn down ("window is not defined", an unhandled error).
 */
async function renderPage() {
  render(
    <AppProviders>
      <ApiDocsPage />
      <ProvidersSettled />
    </AppProviders>,
  );
  await screen.findByTestId('providers-settled');
}

describe('ApiDocsPage', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'session-token');
  });

  it('shows the document of the backend in the viewer, loaded with the page', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'API', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('List the units', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('links to the document a client reads without a session', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: '/api/openapi.json' })).toHaveAttribute(
      'href',
      '/api/openapi.json',
    );
  });

  it('shows an error instead of the viewer when the document cannot be loaded, and retries', async () => {
    mockApiError('get', '/api/openapi/full.json', 500, 'Server error');
    await renderPage();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    mockApiResponse('get', '/api/openapi/full.json', OPENAPI_DOCUMENT);
    const request = captureRequest('get', '/api/openapi/full.json');
    await userEvent.click(retry);

    await waitFor(() => expect(request.count()).toBe(1));
    // The viewer itself mounts once per test file in jsdom: its rendering is checked above
    await waitFor(() => expect(screen.queryByText('An error occurred')).not.toBeInTheDocument());
  });

  describe('in French', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('fr');
    });

    it('translates its texts', async () => {
      await renderPage();

      expect(
        screen.getByText(
          /Sans session, les scripts et les intégrations lisent les routes publiques/,
        ),
      ).toBeInTheDocument();
    });
  });
});
