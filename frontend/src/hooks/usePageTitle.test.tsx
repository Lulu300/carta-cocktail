import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { buildSiteSettings } from '../test/factories';
import { mockApiResponse } from '../test/msw/utils';
import { SiteSettingsProvider } from '../contexts/SiteSettingsContext';
import { usePageTitle } from './usePageTitle';

function Page({ parts }: { parts: (string | null | undefined)[] }) {
  usePageTitle(...parts);
  return null;
}

function renderPage(parts: (string | null | undefined)[], mounted = true) {
  return (
    <SiteSettingsProvider>
      {mounted && <Page parts={parts} />}
    </SiteSettingsProvider>
  );
}

describe('usePageTitle', () => {
  beforeEach(() => {
    mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName: 'My Bar' }));
  });

  it('should put the parts in order before the site name', async () => {
    render(renderPage(['Mojito', 'Summer menu']));

    await waitFor(() => expect(document.title).toBe('Mojito · Summer menu · My Bar'));
  });

  it('should skip empty parts', async () => {
    render(renderPage([undefined, 'Summer menu', null, '']));

    await waitFor(() => expect(document.title).toBe('Summer menu · My Bar'));
  });

  it('should follow the parts when they change', async () => {
    const { rerender } = render(renderPage([undefined]));
    await waitFor(() => expect(document.title).toBe('My Bar'));

    rerender(renderPage(['Mojito']));

    expect(document.title).toBe('Mojito · My Bar');
  });

  it('should keep the page title when the site name arrives afterwards', async () => {
    render(renderPage(['Mojito']));

    expect(document.title).toBe('Mojito · Carta Cocktail');
    await waitFor(() => expect(document.title).toBe('Mojito · My Bar'));
  });

  it('should give back the site name when the page unmounts', async () => {
    const { rerender } = render(renderPage(['Mojito']));
    await waitFor(() => expect(document.title).toBe('Mojito · My Bar'));

    rerender(renderPage(['Mojito'], false));

    expect(document.title).toBe('My Bar');
  });
});
