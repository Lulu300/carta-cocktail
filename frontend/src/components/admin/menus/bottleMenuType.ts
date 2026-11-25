import type { Bottle, Menu } from '../../../types';
import { isBottleMenu, type BottleMenuType } from '../../../utils/menuType';

/** The box of a bottle that makes it available for the menus of a type. Same rule as the backend's BOTTLE_MENU_FLAG. */
const BOTTLE_MENU_FLAG: Record<BottleMenuType, 'isApero' | 'isDigestif'> = { APEROS: 'isApero', DIGESTIFS: 'isDigestif' };

/** A bottle checked for the type of the menu, empty or not; no bottle goes in a cocktail menu. */
export function isAvailableForMenu(bottle: Pick<Bottle, 'isApero' | 'isDigestif'>, menu: Pick<Menu, 'type'>): boolean {
  return isBottleMenu(menu) && bottle[BOTTLE_MENU_FLAG[menu.type]];
}

/** The editor of the menu: the bottle editor for a bottle menu. */
export function menuEditorPath(menu: Pick<Menu, 'id' | 'type'>): string {
  return isBottleMenu(menu) ? `/admin/menus/${menu.id}/bottles` : `/admin/menus/${menu.id}`;
}
