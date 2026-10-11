import { z } from 'zod';
import { Id, Percent, RequiredText, Translations } from './common';
import { AlcoholPercentage, CapacityMl } from './bottles';
import { DesiredStock } from './categories';
import { SourceType, Tags } from './cocktails';
import { ConversionFactorToMl } from './units';

// Format written by GET /cocktails/:id/export (version 1). Only the fields the
// import reads are listed; the others are dropped.

const ImportUnit = z.object({
  name: z.string().optional(),
  abbreviation: RequiredText,
  conversionFactorToMl: ConversionFactorToMl.optional(),
  nameTranslations: Translations.optional(),
});

const ImportSourceDetail = z.object({
  // BOTTLE source: the bottle's category
  categoryName: z.string().optional(),
  categoryType: z.string().optional(),
  categoryNameTranslations: Translations.optional(),
  // CATEGORY source
  type: z.string().optional(),
  desiredStock: DesiredStock.optional(),
  // CATEGORY and INGREDIENT sources
  nameTranslations: Translations.optional(),
  // INGREDIENT source
  icon: z.string().nullish(),
});

const ImportIngredientLine = z.object({
  sourceType: SourceType,
  sourceName: RequiredText,
  sourceDetail: ImportSourceDetail.optional(),
  quantity: z.number(),
  unit: ImportUnit.nullish(),
  position: z.number().optional(),
  preferredBottles: z.array(z.object({ name: RequiredText, categoryName: z.string().optional() })).optional(),
});

export const ImportRecipeV1 = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  cocktail: z.object({
    name: RequiredText,
    description: z.string().nullish(),
    notes: z.string().nullish(),
    tags: Tags.optional(),
    ingredients: z.array(ImportIngredientLine).optional(),
    instructions: z.array(z.object({ stepNumber: z.number().optional(), text: z.string() })).optional(),
  }),
});

// What the admin chose for each referenced entity. `data` lists the only fields
// written on creation: anything else in the request (id, createdAt, purchasePrice...)
// is dropped.

const UnitData = z.object({
  name: RequiredText,
  abbreviation: RequiredText,
  conversionFactorToMl: ConversionFactorToMl.optional(),
  nameTranslations: Translations.optional(),
});

const CategoryData = z.object({
  name: RequiredText,
  type: RequiredText.default('SPIRIT'),
  desiredStock: DesiredStock.optional(),
  minimumPercent: Percent.optional(),
  nameTranslations: Translations.optional(),
});

const BottleData = z.object({
  name: RequiredText,
  categoryName: z.string().optional(),
  capacityMl: CapacityMl,
  remainingPercent: Percent.optional(),
  alcoholPercentage: AlcoholPercentage.optional(),
});

const IngredientData = z.object({
  name: RequiredText,
  icon: z.string().nullish(),
  nameTranslations: Translations.optional(),
});

function resolutionsOf<T extends z.ZodType>(data: T) {
  const resolution = z.object({
    action: z.enum(['use_existing', 'create', 'skip']),
    existingId: Id.nullish(),
    data: data.optional(),
  });
  // Keyed by the lowercased abbreviation (units) or name (other entities)
  return z.record(z.string(), resolution).optional();
}

export const ImportResolutions = z.object({
  units: resolutionsOf(UnitData),
  categories: resolutionsOf(CategoryData),
  bottles: resolutionsOf(BottleData),
  ingredients: resolutionsOf(IngredientData),
});

export const ImportConfirm = z.object({
  recipe: ImportRecipeV1,
  resolutions: ImportResolutions.optional(),
});
