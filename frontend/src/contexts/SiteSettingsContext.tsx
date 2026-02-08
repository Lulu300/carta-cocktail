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

  return (
    <SiteSettingsContext.Provider value={{ siteSettings, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
