import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildSiteSettings } from '../test/factories';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import {
  captureRequest, mockApiResponse, mockNetworkError, mockRateLimited, rateLimitedResponse,
} from '../test/msw/utils';
import { SiteSettingsProvider, useSiteSettings } from './SiteSettingsContext';

function mockSettings(siteName: string, siteIcon = '') {
  mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName, siteIcon }));
}

/**
 * Holds the first settings request until `release()` and then answers `firstAnswer`;
 * later requests get the `laterSettings` at once. `count()` counts every request.
 */
function holdFirstSettingsRequest(firstAnswer: () => Response, laterSettings = buildSiteSettings()) {
  let requests = 0;
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => { release = resolve; });
  server.use(
    http.get('/api/public/settings', async () => {
      requests += 1;
      if (requests > 1) return HttpResponse.json(laterSettings);
      await released;
      return firstAnswer();
    }),
  );
  return { release, count: () => requests };
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

  describe('until the first load succeeds', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function faviconHref() {
      return document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href;
    }

    it('should load the settings again once the Retry-After of a 429 has passed', async () => {
      mockRateLimited('get', '/api/public/settings', 60);
      const refused = captureRequest('get', '/api/public/settings');
      const { result } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(refused.count()).toBe(1));

      mockSettings('My Bar', '🍸');
      const retried = captureRequest('get', '/api/public/settings');
      await act(() => vi.advanceTimersByTimeAsync(55_000));
      expect(retried.count()).toBe(0);
      expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');

      await act(() => vi.advanceTimersByTimeAsync(5_000));

      await waitFor(() => expect(result.current.siteSettings.siteName).toBe('My Bar'));
      expect(result.current.siteSettings.siteIcon).toBe('🍸');
      expect(document.title).toBe('My Bar');
      expect(faviconHref()).toContain('data:image/svg+xml');
      expect(retried.count()).toBe(1);
    });

    it('should wait 30 seconds before trying again after a network error', async () => {
      mockNetworkError('get', '/api/public/settings');
      const failed = captureRequest('get', '/api/public/settings');
      const { result } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(failed.count()).toBe(1));

      mockSettings('My Bar');
      const retried = captureRequest('get', '/api/public/settings');
      await act(() => vi.advanceTimersByTimeAsync(29_000));
      expect(retried.count()).toBe(0);

      await act(() => vi.advanceTimersByTimeAsync(1_000));

      await waitFor(() => expect(result.current.siteSettings.siteName).toBe('My Bar'));
    });

    it('should stop retrying on its own after three more attempts', async () => {
      mockRateLimited('get', '/api/public/settings', 1);
      const request = captureRequest('get', '/api/public/settings');
      const { result } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(request.count()).toBe(1));

      for (let attempt = 2; attempt <= 4; attempt += 1) {
        await act(() => vi.advanceTimersByTimeAsync(1_000));
        await waitFor(() => expect(request.count()).toBe(attempt));
      }
      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

      expect(request.count()).toBe(4);
      expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');
    });

    it('should not retry once unmounted when a refusal arrives after the unmount', async () => {
      const first = holdFirstSettingsRequest(() => rateLimitedResponse(1));
      const { unmount } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(first.count()).toBe(1));

      unmount();
      first.release();
      await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));

      expect(first.count()).toBe(1);
    });

    it('should keep what refresh loaded when an older automatic load answers later', async () => {
      const first = holdFirstSettingsRequest(
        () => HttpResponse.json(buildSiteSettings({ siteName: 'Stale' })),
        buildSiteSettings({ siteName: 'Just saved' }),
      );
      const { result } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(first.count()).toBe(1));

      await act(() => result.current.refresh());
      expect(result.current.siteSettings.siteName).toBe('Just saved');

      first.release();
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      expect(result.current.siteSettings.siteName).toBe('Just saved');
    });

    it('should load them at once on retryFailedLoad, without the pending automatic retry', async () => {
      mockRateLimited('get', '/api/public/settings', 60);
      const refused = captureRequest('get', '/api/public/settings');
      const { result } = renderHook(() => useSiteSettings(), { wrapper });
      await waitFor(() => expect(refused.count()).toBe(1));

      mockSettings('My Bar', '🍸');
      const retried = captureRequest('get', '/api/public/settings');
      act(() => result.current.retryFailedLoad());

      await waitFor(() => expect(result.current.siteSettings.siteName).toBe('My Bar'));
      await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
      expect(retried.count()).toBe(1);
    });
  });

  it('should not send a request on retryFailedLoad once the settings have arrived', async () => {
    mockSettings('My Bar');
    const { result } = renderHook(() => useSiteSettings(), { wrapper });
    await waitFor(() => expect(result.current.siteSettings.siteName).toBe('My Bar'));

    const request = captureRequest('get', '/api/public/settings');
    act(() => result.current.retryFailedLoad());
    await act(async () => {});

    expect(request.count()).toBe(0);
  });
});
