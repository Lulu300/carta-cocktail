import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiError, publicApi } from '../services/api';
import type { SiteSettings } from '../types';

interface SiteSettingsContextType {
  siteSettings: SiteSettings;
  refresh: () => Promise<void>;
  /** Loads the settings again if they never arrived; does nothing once they have. */
  retryFailedLoad: () => void;
}

const defaultSettings: SiteSettings = { siteName: 'Carta Cocktail', siteIcon: '' };

// A failed first load (rate limit, network, restart) is retried a few times, slowly
// enough not to add to a 429. After that, only the guest's "Retry" loads them again.
const MAX_AUTOMATIC_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 30_000;

/** Waits what the server asks on a 429 (Retry-After), a fixed pause otherwise. */
function retryDelayMs(error: unknown): number {
  if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
    return Math.max(error.retryAfterSeconds, 1) * 1000;
  }
  return DEFAULT_RETRY_DELAY_MS;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteSettings: defaultSettings,
  refresh: async () => {},
  retryFailedLoad: () => {},
});

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSettings);
  // Until the saved settings arrive, the header and the tab show the default name and icon.
  const [loaded, setLoaded] = useState(false);

  const showSettings = useCallback((settings: SiteSettings) => {
    setSiteSettings(settings);
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      showSettings(await publicApi.getSettings());
    } catch {
      // Keep the current settings (the defaults if they never arrived)
    }
  }, [showSettings]);

  const retryFailedLoad = useCallback(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  // Runs until the settings arrive: a success, here or through refresh, cancels the pending retry.
  useEffect(() => {
    if (loaded) return undefined;
    let cancelled = false;
    let retryTimer: number | undefined;

    const load = async (retriesLeft: number) => {
      try {
        const settings = await publicApi.getSettings();
        if (!cancelled) showSettings(settings);
      } catch (error) {
        if (cancelled || retriesLeft === 0) return;
        retryTimer = window.setTimeout(() => void load(retriesLeft - 1), retryDelayMs(error));
      }
    };
    void load(MAX_AUTOMATIC_RETRIES);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [loaded, showSettings]);

  // Update document title and favicon when settings change
  useEffect(() => {
    document.title = siteSettings.siteName || 'Carta Cocktail';

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      if (siteSettings.siteIcon) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${siteSettings.siteIcon}</text></svg>`;
        link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        link.type = 'image/svg+xml';
      } else {
        link.href = '/vite.svg';
        link.type = 'image/svg+xml';
      }
    }
  }, [siteSettings.siteName, siteSettings.siteIcon]);

  return (
    <SiteSettingsContext.Provider value={{ siteSettings, refresh, retryFailedLoad }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
