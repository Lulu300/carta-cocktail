import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { publicApi } from '../services/api';
import type { SiteSettings } from '../types';

interface SiteSettingsContextType {
  siteSettings: SiteSettings;
  refresh: () => Promise<void>;
}

const defaultSettings: SiteSettings = { siteName: 'Carta Cocktail', siteIcon: '' };

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteSettings: defaultSettings,
  refresh: async () => {},
});

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSettings);

  const refresh = useCallback(async () => {
    try {
      const data = await publicApi.getSettings();
      setSiteSettings(data);
    } catch {
      // Keep defaults on error
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    <SiteSettingsContext.Provider value={{ siteSettings, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
