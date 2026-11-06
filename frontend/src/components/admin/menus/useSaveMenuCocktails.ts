import { menus as menusApi } from '../../../services/api';
import type { MenuCocktail } from '../../../types';
import { updateMenu, useMenuMutation, type MenuMutation, type MenuState } from './useMenuMutation';

/**
 * One click in the cocktail editor, applied to whatever list it receives: the
 * list shown on screen at once, then the list the server has confirmed when
 * the request leaves, so a refused earlier click is never sent again.
 */
export type CocktailsEdit = (cocktails: MenuCocktail[]) => MenuCocktail[];

export const cocktailsEdits = {
  update: (cocktailId: number, changes: Pick<Partial<MenuCocktail>, 'isHidden' | 'menuSectionId'>): CocktailsEdit =>
    (cocktails) => cocktails.map((item) => (item.cocktailId === cocktailId ? { ...item, ...changes } : item)),

  remove: (cocktailId: number): CocktailsEdit =>
    (cocktails) => cocktails.filter((item) => item.cocktailId !== cocktailId),

  add: (added: MenuCocktail): CocktailsEdit =>
    (cocktails) => (cocktails.some((item) => item.cocktailId === added.cocktailId) ? cocktails : [...cocktails, added]),

  /** The cocktails in the given order; one missing from it keeps its place after them. */
  order: (cocktailIds: number[]): CocktailsEdit => (cocktails) => [
    ...cocktailIds.flatMap((id) => cocktails.filter((item) => item.cocktailId === id)),
    ...cocktails.filter((item) => !cocktailIds.includes(item.cocktailId)),
  ],
};

function withPositions(cocktails: MenuCocktail[]): MenuCocktail[] {
  return cocktails.map((cocktail, position) => ({ ...cocktail, position }));
}

function editedCocktails(state: MenuState, edit: CocktailsEdit): MenuCocktail[] {
  return withPositions(edit(state.menu?.cocktails ?? []));
}

/**
 * Saves the whole composition of a cocktail menu, in display order: the server
 * replaces it in one transaction, sections and visibility included.
 */
export function useSaveMenuCocktails(menuId: number): MenuMutation<CocktailsEdit> {
  return useMenuMutation<CocktailsEdit>({
    menuId,
    mutationFn: (edit, confirmed) => menusApi.update(menuId, {
      cocktails: editedCocktails(confirmed, edit).map(({ cocktailId, position, isHidden, menuSectionId }) => ({
        cocktailId,
        position,
        isHidden,
        menuSectionId,
      })),
    }),
    applyOptimistic: (state, edit) => updateMenu(state, (menu) => ({ ...menu, cocktails: editedCocktails(state, edit) })),
  });
}
