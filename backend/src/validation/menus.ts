import { z } from 'zod';
import { Id, Position, RequiredText, Timestamp } from './common';
import { Bottle, BottleRow } from './bottles';
import { CocktailIngredient, CocktailRow } from './cocktails';
import { MenuSection } from './menuSections';

export const MENU_TYPES = ['COCKTAILS', 'APEROS', 'DIGESTIFS'] as const;
export const MenuType = z.enum(MENU_TYPES);
export type MenuType = z.output<typeof MenuType>;

const MenuItem = z.object({
  position: Position.optional(),
  isHidden: z.boolean().optional(),
  menuSectionId: Id.nullish(),
});

export const MenuCreate = z.object({
  name: RequiredText,
  slug: RequiredText,
  description: z.string().nullish(),
  isPublic: z.boolean().optional(),
  type: MenuType.optional(),
});

/** When `cocktails` or `bottles` is sent, it replaces the whole list of the menu. */
export const MenuUpdate = MenuCreate.partial().extend({
  cocktails: z.array(MenuItem.extend({ cocktailId: Id })).optional(),
  bottles: z.array(MenuItem.extend({ bottleId: Id })).optional(),
});

/** A menu as stored, without its items. */
export const MenuRow = z.strictObject({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  type: MenuType,
  isPublic: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

/** The fields shared by the cocktails and the bottles of a menu. */
export const MenuItemRow = z.strictObject({
  id: Id,
  menuId: Id,
  menuSectionId: Id.nullable(),
  position: z.number().int(),
  isHidden: z.boolean(),
});

/** A menu in a list, with its items counted: all of them for the admin, the visible ones for a guest. */
export const MenuSummary = MenuRow.extend({
  _count: z.strictObject({ cocktails: z.number().int(), bottles: z.number().int() }),
});

/** A bottle of a menu, with its category (menu editor and /menu-bottles routes). */
export const MenuBottle = MenuItemRow.extend({
  bottleId: Id,
  bottle: Bottle,
});

/** A recipe line as the menu editor loads it: without preferred bottles, its bottle without category. */
export const MenuCocktailIngredient = CocktailIngredient.omit({ preferredBottles: true }).extend({
  bottle: BottleRow.nullable(),
});

/** A cocktail of a menu, with its recipe lines but not its steps (GET /menus/:id). */
export const MenuCocktail = MenuItemRow.extend({
  cocktailId: Id,
  cocktail: CocktailRow.extend({ ingredients: z.array(MenuCocktailIngredient) }),
});

/** A menu in the admin's editor, with its sections and all its items, hidden ones included. */
export const MenuDetail = MenuRow.extend({
  sections: z.array(MenuSection),
  cocktails: z.array(MenuCocktail),
  bottles: z.array(MenuBottle),
});

/** Answer of PUT /menus/:id: the menu and its items, the cocktails without their recipe. */
export const UpdatedMenu = MenuRow.extend({
  cocktails: z.array(MenuItemRow.extend({ cocktailId: Id, cocktail: CocktailRow })),
  bottles: z.array(MenuBottle),
});
