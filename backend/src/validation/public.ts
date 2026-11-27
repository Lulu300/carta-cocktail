import { z } from 'zod';
import { Id } from './common';
import { BottleRow } from './bottles';
import { PublicCategory } from './categories';
import { CocktailInstruction, CocktailRow, SourceType } from './cocktails';
import { PublicIngredient } from './ingredients';
import { MenuItemRow, MenuRow } from './menus';
import { MenuSection } from './menuSections';
import { Unit } from './units';

// Responses of routes/public.ts. They follow the selects of services/cocktail/includes.ts:
// inventory data (purchase price, opening date, remaining level, desired stock) is never sent.

/** The bottle of a recipe line. */
export const PublicIngredientBottle = BottleRow.pick({
  id: true,
  name: true,
  alcoholPercentage: true,
}).extend({
  category: PublicCategory,
});

export const PublicCocktailIngredient = z.strictObject({
  id: Id,
  quantity: z.number(),
  position: z.number().int(),
  sourceType: SourceType,
  unit: Unit,
  bottle: PublicIngredientBottle.nullable(),
  category: PublicCategory.nullable(),
  ingredient: PublicIngredient.nullable(),
  /** Private: only in the admin preview. */
  preferredBottles: z.array(z.strictObject({ id: Id, bottle: PublicIngredientBottle })).optional(),
});

export const PublicCocktail = CocktailRow.pick({
  id: true,
  name: true,
  description: true,
  imagePath: true,
  tags: true,
  isAvailable: true,
}).extend({
  /** Private: only in the admin preview. */
  notes: z.string().nullable().optional(),
  /** The manual switch is on and the stock allows one serving. */
  available: z.boolean(),
  ingredients: z.array(PublicCocktailIngredient),
  instructions: z.array(CocktailInstruction.pick({ id: true, stepNumber: true, text: true })),
});

export const PublicMenuCocktail = MenuItemRow.extend({
  cocktailId: Id,
  cocktail: PublicCocktail,
});

export const PublicMenuBottle = MenuItemRow.extend({
  bottleId: Id,
  bottle: BottleRow.pick({
    id: true,
    name: true,
    capacityMl: true,
    categoryId: true,
    alcoholPercentage: true,
    location: true,
  }).extend({ category: PublicCategory }),
});

/** A menu with its sections and its visible items, in the admin's order. */
export const PublicMenu = MenuRow.extend({
  sections: z.array(MenuSection),
  cocktails: z.array(PublicMenuCocktail),
  bottles: z.array(PublicMenuBottle),
});
