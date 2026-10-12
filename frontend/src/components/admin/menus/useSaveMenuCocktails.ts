import { menus as menusApi } from '../../../services/api';
import type { MenuCocktail } from '../../../types';
import { useMenuMutation, type MenuMutation } from './useMenuMutation';

function withPositions(cocktails: MenuCocktail[]): MenuCocktail[] {
  return cocktails.map((cocktail, position) => ({ ...cocktail, position }));
}

/**
 * Saves the whole composition of a cocktail menu, in display order: the server
 * replaces it in one transaction, sections and visibility included.
 */
export function useSaveMenuCocktails(menuId: number): MenuMutation<MenuCocktail[]> {
  return useMenuMutation<MenuCocktail[]>({
    menuId,
    mutationFn: (cocktails) => menusApi.update(menuId, {
      cocktails: withPositions(cocktails).map(({ cocktailId, position, isHidden, menuSectionId }) => ({
        cocktailId,
        position,
        isHidden,
        menuSectionId,
      })),
    }),
    applyOptimistic: (cache, cocktails) => cache.menu((menu) => ({ ...menu, cocktails: withPositions(cocktails) })),
  });
}
