import type { Menu } from '../../../types';

/**
 * Slugs of the menus the backend creates by itself (the aperitifs and digestifs
 * menus): they cannot be deleted. Same list as the backend's SYSTEM_MENU_SLUGS,
 * until the API exposes the flag.
 */
const SYSTEM_MENU_SLUGS: readonly string[] = ['aperitifs', 'digestifs'];

export function isSystemMenu(menu: Pick<Menu, 'slug'>): boolean {
  return SYSTEM_MENU_SLUGS.includes(menu.slug);
}
