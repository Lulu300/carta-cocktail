import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
});
