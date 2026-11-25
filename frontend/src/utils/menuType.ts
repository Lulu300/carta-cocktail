import type { Menu } from '../types';

/** The types of the menus that hold bottles rather than cocktails. */
export type BottleMenuType = Exclude<Menu['type'], 'COCKTAILS'>;

/** An aperitifs or digestifs menu, system or personal: it holds bottles. */
export function isBottleMenu<M extends Pick<Menu, 'type'>>(menu: M): menu is M & { type: BottleMenuType } {
  return menu.type === 'APEROS' || menu.type === 'DIGESTIFS';
}
