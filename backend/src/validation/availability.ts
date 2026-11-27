import { z } from 'zod';
import { Id, StoredTranslations } from './common';
import { SourceType } from './cocktails';

// Responses of routes/availability.ts, built by services/availabilityService.ts.

/** A name the frontend localizes: `nameTranslations` is null when the row has none (bottles never do). */
const LocalizedName = z.strictObject({
  name: z.string(),
  nameTranslations: StoredTranslations,
});

export const IngredientAvailability = LocalizedName.extend({
  cocktailIngredientId: Id,
  sourceType: SourceType,
  /** The source is gone or unreadable: `name` is empty. */
  orphan: z.boolean(),
  icon: z.string().nullable(),
  quantity: z.number(),
  /** Abbreviation of the line's unit. */
  unit: z.string(),
  isAvailable: z.boolean(),
  /** Servings this line's resource allows; null when unlimited or not measured. */
  availableCount: z.number().int().nullable(),
  /** CATEGORY lines with preferred bottles only: at least one preferred bottle is not empty. */
  preferredAvailable: z.boolean().optional(),
});

/** A resource that allows only a few servings; the frontend words the warning. */
export const LowStockResource = LocalizedName.extend({
  servings: z.number().int(),
});

/** The lines to flag as missing are the `ingredients` whose `isAvailable` is false. */
export const CocktailAvailability = z.strictObject({
  cocktailId: Id,
  isAvailable: z.boolean(),
  maxServings: z.number().int(),
  ingredients: z.array(IngredientAvailability),
  lowStock: z.array(LowStockResource),
});

/** Availability of every cocktail, keyed by cocktail id. */
export const CocktailAvailabilities = z.record(z.string(), CocktailAvailability);
