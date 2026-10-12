import { z } from 'zod';
import type { Cocktail, CocktailIngredient, CocktailIngredientInput, CocktailInput, Ingredient, Unit } from '../../../types';
import { parseTags } from './parseTags';

// Error messages are i18n keys, translated where the error is shown.
// Rules follow the backend schema (backend/src/validation/cocktails.ts) until F-05 shares it.

export const SOURCE_TYPES = ['BOTTLE', 'CATEGORY', 'INGREDIENT'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** The id a line of each source type points to; the other two stay empty. */
export const SOURCE_KEYS = {
  BOTTLE: 'bottleId',
  CATEGORY: 'categoryId',
  INGREDIENT: 'ingredientId',
} as const satisfies Record<SourceType, string>;

// A select left on its empty option holds null.
const OptionalId = z.number().int().positive().nullable();
const RequiredId = z
  .number()
  .nullable()
  .pipe(z.number({ error: 'validation.required' }).int().positive({ error: 'validation.required' }));
// An emptied number input holds NaN, which z.number() refuses as a wrong type.
// A quantity of 0 is a number: the row refinement refuses it, unless the line already had it.
const Quantity = z.number({ error: 'validation.positive' });

/** The fields of a recipe line, as the form holds them. */
const StoredLine = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  bottleId: z.number().nullable(),
  categoryId: z.number().nullable(),
  ingredientId: z.number().nullable(),
  preferredBottleIds: z.array(z.number()),
  quantity: z.number(),
  unitId: z.number().nullable(),
});
type StoredLineValues = z.infer<typeof StoredLine>;

/**
 * One row of the recipe. All rows share the same fields, whatever their source,
 * so that switching the source of a row only resets values.
 */
const ingredientRow = z
  .object({
    sourceType: z.enum(SOURCE_TYPES),
    bottleId: OptionalId,
    categoryId: OptionalId,
    ingredientId: OptionalId,
    preferredBottleIds: z.array(z.number().int().positive()),
    quantity: Quantity,
    unitId: RequiredId,
    /** The line as loaded, kept only when it already had a defect in the database. */
    storedLine: StoredLine.nullable(),
  })
  .superRefine(
    (row, ctx) => {
      // Like the backend since C-21: a defect the cocktail already has may stay, a new one may not.
      if (isKeptStoredDefect(row)) return;
      const sourceKey = SOURCE_KEYS[row.sourceType];
      if (sourceKey && row[sourceKey] == null) {
        ctx.addIssue({ code: 'custom', path: [sourceKey], message: 'validation.sourceRequired' });
      }
      if (row.quantity <= 0) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'validation.positive' });
      }
    },
    // Also runs when another field of the row is invalid, so every error shows at once.
    { when: () => true },
  );

/** A missing source (deleted before v1.8.0) or a quantity of 0, both refused on a new line. */
function hasDefect(line: StoredLineValues): boolean {
  return line[SOURCE_KEYS[line.sourceType]] == null || line.quantity === 0;
}

function sameLine(a: StoredLineValues, b: StoredLineValues): boolean {
  const sameIds = (x: number[], y: number[]) => [...x].sort().join() === [...y].sort().join();
  return a.sourceType === b.sourceType
    && a.bottleId === b.bottleId
    && a.categoryId === b.categoryId
    && a.ingredientId === b.ingredientId
    && a.quantity === b.quantity
    && a.unitId === b.unitId
    && sameIds(a.preferredBottleIds, b.preferredBottleIds);
}

/**
 * True for a line loaded with a defect and left as it was: it is saved as is,
 * with a warning. Once changed, the line is validated like a new one.
 */
export function isKeptStoredDefect(row: StoredLineValues & { storedLine: StoredLineValues | null }): boolean {
  return row.storedLine !== null && hasDefect(row) && sameLine(row, row.storedLine);
}

export const cocktailFormSchema = z.object({
  name: z.string().trim().min(1, { error: 'validation.required' }),
  description: z.string(),
  notes: z.string(),
  /** Comma-separated, as typed. */
  tags: z.string(),
  isAvailable: z.boolean(),
  ingredients: z.array(ingredientRow),
  instructions: z.array(z.object({ text: z.string() })),
});

export type CocktailFormValues = z.input<typeof cocktailFormSchema>;
export type ValidCocktailForm = z.output<typeof cocktailFormSchema>;
export type IngredientRowValues = CocktailFormValues['ingredients'][number];

export const EMPTY_COCKTAIL_FORM: CocktailFormValues = {
  name: '',
  description: '',
  notes: '',
  tags: '',
  isAvailable: true,
  ingredients: [],
  instructions: [{ text: '' }],
};

/** A new row starts on the first free ingredient and the first unit, as most lines use them. */
export function newIngredientRow(ingredients: Ingredient[], units: Unit[]): IngredientRowValues {
  return {
    sourceType: 'INGREDIENT',
    bottleId: null,
    categoryId: null,
    ingredientId: ingredients[0]?.id ?? null,
    preferredBottleIds: [],
    quantity: 1,
    unitId: units[0]?.id ?? null,
    storedLine: null,
  };
}

function toIngredientInput(row: ValidCocktailForm['ingredients'][number]): CocktailIngredientInput {
  const isCategory = row.sourceType === 'CATEGORY';
  return {
    sourceType: row.sourceType,
    bottleId: row.sourceType === 'BOTTLE' ? row.bottleId : null,
    categoryId: isCategory ? row.categoryId : null,
    ingredientId: row.sourceType === 'INGREDIENT' ? row.ingredientId : null,
    quantity: row.quantity,
    unitId: row.unitId,
    preferredBottleIds: isCategory ? row.preferredBottleIds : undefined,
  };
}

/**
 * The full recipe sent on create and update. The update only writes the fields
 * it receives, so every field is sent, an emptied text included (as null).
 */
export function toCocktailInput(values: ValidCocktailForm): CocktailInput {
  return {
    name: values.name,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
    tags: parseTags(values.tags),
    isAvailable: values.isAvailable,
    ingredients: values.ingredients.map(toIngredientInput),
    instructions: values.instructions.filter((step) => step.text.trim()).map((step) => ({ text: step.text })),
  };
}

function fromCocktailIngredient(line: CocktailIngredient): IngredientRowValues {
  const values: StoredLineValues = {
    sourceType: line.sourceType,
    bottleId: line.bottleId,
    categoryId: line.categoryId,
    ingredientId: line.ingredientId,
    preferredBottleIds: line.preferredBottles?.map((preferred) => preferred.bottleId) ?? [],
    quantity: line.quantity,
    unitId: line.unitId,
  };
  return { ...values, storedLine: hasDefect(values) ? values : null };
}

export function fromCocktail(cocktail: Cocktail): CocktailFormValues {
  const instructions = cocktail.instructions ?? [];
  return {
    name: cocktail.name,
    description: cocktail.description ?? '',
    notes: cocktail.notes ?? '',
    tags: cocktail.tags ?? '',
    isAvailable: cocktail.isAvailable,
    ingredients: (cocktail.ingredients ?? []).map(fromCocktailIngredient),
    // An empty step is ready to type in, as in a new cocktail.
    instructions: instructions.length > 0 ? instructions.map((step) => ({ text: step.text })) : [{ text: '' }],
  };
}
