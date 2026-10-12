/**
 * Stand-in for i18next's `t` that keeps the interpolation values visible, so a test
 * can check counts and plurals: t('menus.bottleCount', { count: 2 }) gives "menus.bottleCount(2)".
 */
export function translateWithValues(key: string, options?: Record<string, unknown>): string {
  if (!options) return key;
  return `${key}(${Object.values(options).join(',')})`;
}
