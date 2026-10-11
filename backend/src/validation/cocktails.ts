import { z } from 'zod';
import { Id, RequiredText } from './common';

export const SOURCE_TYPES = ['BOTTLE', 'CATEGORY', 'INGREDIENT'] as const;
export const SourceType = z.enum(SOURCE_TYPES);

// The foreign key each source type points to. The other two must stay empty.
const SOURCE_KEYS = {
  BOTTLE: 'bottleId',
  CATEGORY: 'categoryId',
  INGREDIENT: 'ingredientId',
} as const;

export const IngredientLine = z
  .object({
    sourceType: SourceType,
    bottleId: Id.nullish(),
    categoryId: Id.nullish(),
    ingredientId: Id.nullish(),
    quantity: z.number().positive(),
    unitId: Id,
    // Bottles to use first among those of the category: only for CATEGORY lines
    preferredBottleIds: z.array(Id).optional(),
  })
  .superRefine((line, ctx) => {
    const expectedKey = SOURCE_KEYS[line.sourceType];
    for (const key of Object.values(SOURCE_KEYS)) {
      const isSet = line[key] != null;
      if (key === expectedKey && !isSet) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Required when sourceType is ${line.sourceType}` });
      } else if (key !== expectedKey && isSet) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Must be empty when sourceType is ${line.sourceType}` });
      }
    }
    const hasPreferredBottles = (line.preferredBottleIds?.length ?? 0) > 0;
    if (hasPreferredBottles && line.sourceType !== 'CATEGORY') {
      ctx.addIssue({ code: 'custom', path: ['preferredBottleIds'], message: 'Only allowed when sourceType is CATEGORY' });
    }
  });

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
export const CocktailUpdate = CocktailCreate.partial();
