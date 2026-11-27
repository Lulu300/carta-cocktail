import type { z } from 'zod';
import type * as bottles from '../validation/bottles';
import type * as categories from '../validation/categories';
import type * as cocktails from '../validation/cocktails';
import type * as common from '../validation/common';
import type * as ingredients from '../validation/ingredients';
import type * as menus from '../validation/menus';
import type * as menuSections from '../validation/menuSections';
import type * as publicResponses from '../validation/public';
import type * as settings from '../validation/settings';
import type * as units from '../validation/units';

/*
 * What the frontend imports from frontend/src/types/generated.ts. `npm run contracts:generate`
 * writes that file from the exports below: each type alias becomes a plain TypeScript type,
 * as the compiler infers it, and each constant is copied as it is. A test fails while the
 * file is out of date.
 *
 * Responses are typed with `z.output`, request bodies with `z.input`: what the frontend
 * sends, before the schema trims or transforms it.
 */

export { SOURCE_KEYS, SOURCE_TYPES } from '../validation/cocktails';
export { MENU_TYPES } from '../validation/menus';

export type SourceType = z.output<typeof cocktails.SourceType>;
export type MenuType = z.output<typeof menus.MenuType>;

// Responses

export type Unit = z.output<typeof units.Unit>;
export type Category = z.output<typeof categories.Category>;
export type PublicCategory = z.output<typeof categories.PublicCategory>;
export type Ingredient = z.output<typeof ingredients.Ingredient>;
export type PublicIngredient = z.output<typeof ingredients.PublicIngredient>;
export type Bottle = z.output<typeof bottles.Bottle>;
export type CocktailRow = z.output<typeof cocktails.CocktailRow>;
export type CocktailPreferredBottle = z.output<typeof cocktails.CocktailPreferredBottle>;
export type CocktailIngredient = z.output<typeof cocktails.CocktailIngredient>;
export type CocktailInstruction = z.output<typeof cocktails.CocktailInstruction>;
export type Cocktail = z.output<typeof cocktails.Cocktail>;
export type MenuSection = z.output<typeof menuSections.MenuSection>;
export type PublicIngredientBottle = z.output<typeof publicResponses.PublicIngredientBottle>;
export type PublicCocktailIngredient = z.output<typeof publicResponses.PublicCocktailIngredient>;
export type PublicCocktail = z.output<typeof publicResponses.PublicCocktail>;
export type PublicMenuSummary = z.output<typeof publicResponses.PublicMenuSummary>;
export type PublicMenuCocktail = z.output<typeof publicResponses.PublicMenuCocktail>;
export type PublicMenuBottle = z.output<typeof publicResponses.PublicMenuBottle>;
export type PublicMenu = z.output<typeof publicResponses.PublicMenu>;
export type SiteSettings = z.output<typeof settings.SiteSettings>;
export type DeletionImpact = z.output<typeof common.DeletionImpact>;
export type DeletionResponse = z.output<typeof common.DeletionResponse>;

// Request bodies

export type CocktailIngredientInput = z.input<typeof cocktails.IngredientLine>;
export type CocktailInput = z.input<typeof cocktails.CocktailCreate>;
export type BottleInput = z.input<typeof bottles.BottleCreate>;
export type BottleUpdateInput = z.input<typeof bottles.BottleUpdate>;
export type MenuCreateInput = z.input<typeof menus.MenuCreate>;
export type MenuUpdateInput = z.input<typeof menus.MenuUpdate>;
