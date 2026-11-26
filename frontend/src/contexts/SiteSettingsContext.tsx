import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiError, publicApi } from '../services/api';
import type { SiteSettings } from '../types';
import { joinTitle } from '../utils/pageTitle';

interface SiteSettingsContextType {
  siteSettings: SiteSettings;
  /** The page's own part of the tab title, shown before the site name (see usePageTitle). */
  setPageTitle: (title: string) => void;
  refresh: () => Promise<void>;
  /** Loads the settings again if they never arrived; does nothing once they have. */
  retryFailedLoad: () => void;
}

// Empty until known: showing a default name would flash before the real one replaces it.
const emptySettings: SiteSettings = { siteName: '', siteIcon: '' };
const FALLBACK_TITLE = 'Carta Cocktail';
const DEFAULT_ICON = '🍸';
// The previous visit's settings: the first render shows the real name and icon at once.
const CACHE_KEY = 'siteSettings';

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

function readCachedSettings(): SiteSettings | null {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (typeof cached !== 'object' || cached === null) return null;
    const { siteName, siteIcon } = cached as Partial<SiteSettings>;
    return typeof siteName === 'string' && typeof siteIcon === 'string' ? { siteName, siteIcon } : null;
  } catch {
    return null;
  }
}

function cacheSettings(settings: SiteSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ siteName: settings.siteName, siteIcon: settings.siteIcon }));
  } catch {
    // Storage is blocked or full: the next visit simply starts without a copy.
  }
}

function emojiFavicon(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteSettings: emptySettings,
  setPageTitle: () => {},
  refresh: async () => {},
  retryFailedLoad: () => {},
});

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [cached] = useState(readCachedSettings);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(cached ?? emptySettings);
  // The copy of the previous visit shows at once but does not count: the server's answer replaces it.
  const [loaded, setLoaded] = useState(false);
  const [pageTitle, setPageTitle] = useState('');

  const showSettings = useCallback((settings: SiteSettings) => {
    setSiteSettings(settings);
    setLoaded(true);
    cacheSettings(settings);
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

  // The tab title and icon follow the settings (a page may then set its own title, see usePageTitle)
  useEffect(() => {
    document.title = joinTitle(pageTitle, siteSettings.siteName || FALLBACK_TITLE);

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = emojiFavicon(siteSettings.siteIcon || DEFAULT_ICON);
      link.type = 'image/svg+xml';
    }
  }, [pageTitle, siteSettings.siteName, siteSettings.siteIcon]);

  return (
    <SiteSettingsContext.Provider value={{ siteSettings, setPageTitle, refresh, retryFailedLoad }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
