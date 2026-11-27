import { z } from 'zod';
import { Id, RequiredText, Timestamp } from './common';
import { Bottle } from './bottles';
import { Category } from './categories';
import { Ingredient } from './ingredients';
import { Unit } from './units';

export const SOURCE_TYPES = ['BOTTLE', 'CATEGORY', 'INGREDIENT'] as const;
export const SourceType = z.enum(SOURCE_TYPES);
export type SourceType = z.output<typeof SourceType>;

// The foreign key each source type points to. The other two must stay empty.
export const SOURCE_KEYS = {
  BOTTLE: 'bottleId',
  CATEGORY: 'categoryId',
  INGREDIENT: 'ingredientId',
} as const;

export type SourceKey = (typeof SOURCE_KEYS)[keyof typeof SOURCE_KEYS];

const IngredientLineFields = z.object({
  sourceType: SourceType,
  bottleId: Id.nullish(),
  categoryId: Id.nullish(),
  ingredientId: Id.nullish(),
  quantity: z.number().positive(),
  unitId: Id,
  // Bottles to use first among those of the category: only for CATEGORY lines
  preferredBottleIds: z.array(Id).optional(),
});

type IngredientLineValue = z.output<typeof IngredientLineFields>;

export function missingSourceKeyMessage(sourceType: string): string {
  return `Required when sourceType is ${sourceType}`;
}

function checkLineCoherence({ requireSourceKey }: { requireSourceKey: boolean }) {
  return (line: IngredientLineValue, ctx: z.RefinementCtx) => {
    const expectedKey = SOURCE_KEYS[line.sourceType];
    for (const key of Object.values(SOURCE_KEYS)) {
      const isSet = line[key] != null;
      if (key === expectedKey && !isSet && requireSourceKey) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: missingSourceKeyMessage(line.sourceType),
        });
      } else if (key !== expectedKey && isSet) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `Must be empty when sourceType is ${line.sourceType}`,
        });
      }
    }
    const hasPreferredBottles = (line.preferredBottleIds?.length ?? 0) > 0;
    if (hasPreferredBottles && line.sourceType !== 'CATEGORY') {
      ctx.addIssue({
        code: 'custom',
        path: ['preferredBottleIds'],
        message: 'Only allowed when sourceType is CATEGORY',
      });
    }
  };
}

export const IngredientLine = IngredientLineFields.superRefine(
  checkLineCoherence({ requireSourceKey: true }),
);

/**
 * Line of a cocktail update. Recipes stored before v1.9.0 can hold lines whose source was
 * deleted (key set to NULL) or with a quantity of 0, and the form sends them back as they are.
 * This variant lets those two defects through; the route then refuses any defect the cocktail
 * did not already have (`findNewRecipeDefects`). Every other rule stays as strict.
 */
export const IngredientLineUpdate = IngredientLineFields.extend({
  quantity: z.number().nonnegative(),
}).superRefine(checkLineCoherence({ requireSourceKey: false }));

/** A recipe step, sent as a plain string or as `{ text }`, normalized to its non-blank text. */
export const Instruction = z
  .union([z.string(), z.object({ text: z.string() })])
  .transform((step) => (typeof step === 'string' ? step : step.text))
  .pipe(RequiredText);

/** Tags are stored comma-separated: the client may send an array or that string. null clears them. */
export const Tags = z.union([z.array(z.string()), z.string()]).nullable();

export const CocktailCreate = z.object({
  name: RequiredText,
  description: z.string().nullish(),
  notes: z.string().nullish(),
  tags: Tags.optional(),
  isAvailable: z.boolean().optional(),
  ingredients: z.array(IngredientLine).optional(),
  instructions: z.array(Instruction).optional(),
});

/** Only the fields present are written; `ingredients` and `instructions` replace the stored lists. */
export const CocktailUpdate = CocktailCreate.partial().extend({
  ingredients: z.array(IngredientLineUpdate).optional(),
});

/**
 * Most cocktails one batch export request can name. Its response holds every recipe at once:
 * the bound keeps it to a few MB. The admin's ZIP export splits a larger selection into batches
 * of this size (EXPORT_BATCH_SIZE in frontend/src/services/exportZip.ts).
 */
export const MAX_EXPORT_BATCH = 500;

/** Cocktails to export, in the order of the files of the response. */
export const CocktailExportBatch = z.object({
  ids: z.array(Id).min(1).max(MAX_EXPORT_BATCH),
});

// Responses of the admin routes (cocktailInclude)

/** A cocktail as stored, without its recipe: the photo upload answers with it. */
export const CocktailRow = z.strictObject({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  imagePath: z.string().nullable(),
  /** Comma-separated, as stored: the routes accept an array or this string. */
  tags: z.string(),
  /** Manual switch set by the admin. */
  isAvailable: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const CocktailPreferredBottle = z.strictObject({
  id: Id,
  cocktailIngredientId: Id,
  bottleId: Id,
  bottle: Bottle,
});

/** A recipe line. Only the source of its `sourceType` is set; it is null when that source was deleted. */
export const CocktailIngredient = z.strictObject({
  id: Id,
  cocktailId: Id,
  quantity: z.number(),
  unitId: Id,
  unit: Unit,
  sourceType: SourceType,
  bottleId: Id.nullable(),
  bottle: Bottle.nullable(),
  categoryId: Id.nullable(),
  category: Category.nullable(),
  ingredientId: Id.nullable(),
  ingredient: Ingredient.nullable(),
  position: z.number().int(),
  preferredBottles: z.array(CocktailPreferredBottle),
});

export const CocktailInstruction = z.strictObject({
  id: Id,
  cocktailId: Id,
  stepNumber: z.number().int(),
  text: z.string(),
});

export const Cocktail = CocktailRow.extend({
  ingredients: z.array(CocktailIngredient),
  instructions: z.array(CocktailInstruction),
});
