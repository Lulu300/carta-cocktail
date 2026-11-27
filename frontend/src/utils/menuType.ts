import type { MenuRow, MenuType } from '../types';

/** The types of the menus that hold bottles rather than cocktails. */
export type BottleMenuType = Exclude<MenuType, 'COCKTAILS'>;

/** An aperitifs or digestifs menu, system or personal: it holds bottles. */
export function isBottleMenu<M extends Pick<MenuRow, 'type'>>(
  menu: M,
): menu is M & { type: BottleMenuType } {
  return menu.type === 'APEROS' || menu.type === 'DIGESTIFS';
}
