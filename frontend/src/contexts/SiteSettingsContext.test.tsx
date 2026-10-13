import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildSiteSettings } from '../test/factories';
import { captureRequest, mockApiResponse, mockNetworkError } from '../test/msw/utils';
import { SiteSettingsProvider, useSiteSettings } from './SiteSettingsContext';

function mockSettings(siteName: string, siteIcon = '') {
  mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName, siteIcon }));
}

function wrapper({ children }: { children: ReactNode }) {
  return <SiteSettingsProvider>{children}</SiteSettingsProvider>;
}

beforeEach(() => {
  // Ensure a link[rel="icon"] exists in document head
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    document.head.appendChild(link);
  }
});

afterEach(() => {
  // Reset document title to avoid test pollution
  document.title = '';
});

describe('SiteSettingsContext', () => {
  it('should have default settings until the saved ones arrive', async () => {
    mockSettings('My Bar', '🍸');
    const { result } = renderHook(() => useSiteSettings(), { wrapper });
    expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');
    expect(result.current.siteSettings.siteIcon).toBe('');

    await waitFor(() => expect(result.current.siteSettings.siteName).toBe('My Bar'));
  });

  it('should fetch settings on mount', async () => {
    mockSettings('My Bar', 'icon');
    const request = captureRequest('get', '/api/public/settings');

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('My Bar');
    });
    expect(request.count()).toBe(1);
  });

  it('should update document title when settings change', async () => {
    mockSettings('Test Title');

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(document.title).toBe('Test Title');
    });
  });

  it('should keep default settings when API call fails on mount', async () => {
    mockNetworkError('get', '/api/public/settings');
    const request = captureRequest('get', '/api/public/settings');

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    // Wait for the failed fetch to complete
    await request.url;
    await act(async () => {});

    // Defaults should be kept
    expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');
    expect(result.current.siteSettings.siteIcon).toBe('');
  });

  it('should update favicon to SVG data URI when siteIcon is set', async () => {
    mockSettings('My Bar', '🍸');

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('data:image/svg+xml');
    });
  });

  it('should reset favicon to /vite.svg when siteIcon is empty', async () => {
    mockSettings('My Bar');

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('vite.svg');
    });
  });

  it('should call refresh and re-fetch settings', async () => {
    mockSettings('Initial');

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Initial');
    });

    mockSettings('Refreshed');
    const refreshed = captureRequest('get', '/api/public/settings');
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Refreshed');
    });
    expect(refreshed.count()).toBe(1);
  });

  it('should keep settings when refresh fails', async () => {
    mockSettings('Initial');

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Initial');
    });

    mockNetworkError('get', '/api/public/settings');

    await act(async () => {
      await result.current.refresh();
    });

    // Should still have the initial value (not reset to defaults)
    expect(result.current.siteSettings.siteName).toBe('Initial');
  });

  it('should not update favicon when no link element exists', async () => {
    // Remove the link[rel="icon"] element
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.remove();

    mockSettings('Bar', '🍹');

    // Should not throw even with no link element
    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Bar');
    });

    // No link element means no href update — just verify title was still set
    expect(document.title).toBe('Bar');
  });

  it('should use fallback title when siteName is empty', async () => {
    mockSettings('');

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(document.title).toBe('Carta Cocktail');
    });
  });
});
