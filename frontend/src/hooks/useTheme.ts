import { useCallback, useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '../utils/theme';

/** The guest's theme, applied to the page while the component using it is mounted. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    // Leaving the public pages (for the admin side, always dark) takes the theme off.
    return () => applyTheme('dark');
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
