/**
 * The public menu's theme, picked by each guest with the toggle of the header and kept in
 * localStorage. Dark is the default, so only a light choice changes the page. The admin side
 * is always dark: PublicLayout puts the theme on <html> while it is mounted and takes it off
 * when it unmounts.
 *
 * public/theme-init.js applies the stored theme before the first paint and repeats these
 * values: keep both in step.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'theme';

/** The `theme-color` of the browser bar for each theme (the canvas color of index.css). */
const THEME_COLORS: Record<Theme, string> = {
  dark: '#0f0f1a',
  light: '#faf7f2',
};

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Site data blocked: the choice lasts until the page is closed.
  }
}

/** Puts the theme on the page: the CSS tokens, the native controls and the browser bar. */
export function applyTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}
