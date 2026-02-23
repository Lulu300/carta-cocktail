import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SiteSettingsProvider, useSiteSettings } from './SiteSettingsContext';

// Mock the API
vi.mock('../services/api', () => ({
  publicApi: {
    getSettings: vi.fn(),
  },
}));

import { publicApi } from '../services/api';
const mockGetSettings = vi.mocked(publicApi.getSettings);

function wrapper({ children }: { children: ReactNode }) {
  return <SiteSettingsProvider>{children}</SiteSettingsProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
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
  it('should have default settings initially', () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: 'Carta Cocktail', siteIcon: '' });
    const { result } = renderHook(() => useSiteSettings(), { wrapper });
    expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');
    expect(result.current.siteSettings.siteIcon).toBe('');
  });

  it('should fetch settings on mount', async () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: 'My Bar', siteIcon: 'icon' });

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('My Bar');
    });
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });

  it('should update document title when settings change', async () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: 'Test Title', siteIcon: '' });

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(document.title).toBe('Test Title');
    });
  });

  it('should keep default settings when API call fails on mount', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    // Wait for the failed fetch to complete
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
    });

    // Defaults should be kept
    expect(result.current.siteSettings.siteName).toBe('Carta Cocktail');
    expect(result.current.siteSettings.siteIcon).toBe('');
  });

  it('should update favicon to SVG data URI when siteIcon is set', async () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: 'My Bar', siteIcon: '🍸' });

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('data:image/svg+xml');
    });
  });

  it('should reset favicon to /vite.svg when siteIcon is empty', async () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: 'My Bar', siteIcon: '' });

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      expect(link?.href).toContain('vite.svg');
    });
  });

  it('should call refresh and re-fetch settings', async () => {
    mockGetSettings
      .mockResolvedValueOnce({ siteName: 'Initial', siteIcon: '' })
      .mockResolvedValueOnce({ siteName: 'Refreshed', siteIcon: '' });

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Initial');
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Refreshed');
    });
    expect(mockGetSettings).toHaveBeenCalledTimes(2);
  });

  it('should keep settings when refresh fails', async () => {
    mockGetSettings
      .mockResolvedValueOnce({ siteName: 'Initial', siteIcon: '' })
      .mockRejectedValueOnce(new Error('Refresh failed'));

    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Initial');
    });

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

    mockGetSettings.mockResolvedValueOnce({ siteName: 'Bar', siteIcon: '🍹' });

    // Should not throw even with no link element
    const { result } = renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.siteSettings.siteName).toBe('Bar');
    });

    // No link element means no href update — just verify title was still set
    expect(document.title).toBe('Bar');
  });

  it('should use fallback title when siteName is empty', async () => {
    mockGetSettings.mockResolvedValueOnce({ siteName: '', siteIcon: '' });

    renderHook(() => useSiteSettings(), { wrapper });

    await waitFor(() => {
      expect(document.title).toBe('Carta Cocktail');
    });
  });
});
