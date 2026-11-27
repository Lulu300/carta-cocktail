import { z } from 'zod';
import {
  Id,
  importMatch,
  Percent,
  RequiredText,
  StoredTranslations,
  Timestamp,
  Translations,
} from './common';
import { AlcoholPercentage, Bottle, CapacityMl } from './bottles';
import { Category, CategoryTypeName, DesiredStock } from './categories';
import { SourceType, Tags } from './cocktails';
import { Ingredient } from './ingredients';
import { ConversionFactorToMl, Unit } from './units';

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
  // Not bounded like IngredientLine: files exported before C-04 keep importing
  quantity: z.number(),
  unit: ImportUnit.nullish(),
  position: z.number().optional(),
  preferredBottles: z
    .array(z.object({ name: RequiredText, categoryName: z.string().optional() }))
    .optional(),
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
    // Blank steps are accepted, unlike Instruction: files exported before C-04 keep importing
    instructions: z
      .array(z.object({ stepNumber: z.number().optional(), text: z.string() }))
      .optional(),
  }),
});

// What the admin chose for each referenced entity. `data` lists the only fields
// written on creation: anything else in the request (id, createdAt, purchasePrice...)
// is dropped.

// The admin may clear a name in the wizard: the route then uses the one in the file.
const NameOrFileName = z.string().trim().optional();

const UnitData = z.object({
  name: NameOrFileName,
  abbreviation: NameOrFileName,
  conversionFactorToMl: ConversionFactorToMl.optional(),
  nameTranslations: Translations.optional(),
});

const CategoryData = z.object({
  name: NameOrFileName,
  type: CategoryTypeName.default('SPIRIT'),
  desiredStock: DesiredStock.optional(),
  minimumPercent: Percent.optional(),
  nameTranslations: Translations.optional(),
});

const BottleData = z.object({
  name: NameOrFileName,
  categoryName: z.string().optional(),
  capacityMl: CapacityMl,
  remainingPercent: Percent.optional(),
  alcoholPercentage: AlcoholPercentage.optional(),
});

const IngredientData = z.object({
  name: NameOrFileName,
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

// Responses. The export (services/cocktail/cocktailExport.ts) writes the file the import reads.

const ExportedUnit = z.strictObject({
  name: z.string(),
  abbreviation: z.string(),
  conversionFactorToMl: z.number().nullable(),
  nameTranslations: StoredTranslations,
});

/** What the import needs to create the source of a line again; empty for a line whose source is gone. */
const ExportedSourceDetail = z.union([
  z.strictObject({
    categoryName: z.string(),
    categoryType: z.string(),
    categoryNameTranslations: StoredTranslations,
  }),
  z.strictObject({ type: z.string(), nameTranslations: StoredTranslations }),
  z.strictObject({ icon: z.string().nullable(), nameTranslations: StoredTranslations }),
  z.strictObject({}),
]);

export const ExportIngredient = z.strictObject({
  sourceType: SourceType,
  /** Empty for a line whose source was deleted before v1.7.0. */
  sourceName: z.string(),
  sourceDetail: ExportedSourceDetail,
  quantity: z.number(),
  unit: ExportedUnit,
  position: z.number().int(),
  /** Private: only in the admin's export. */
  preferredBottles: z
    .array(z.strictObject({ name: z.string(), categoryName: z.string() }))
    .optional(),
});

/** A cocktail exported as JSON, format version 1. */
export const CocktailExportFormat = z.strictObject({
  version: z.literal(1),
  exportedAt: Timestamp,
  cocktail: z.strictObject({
    name: z.string(),
    description: z.string().nullable(),
    /** Private: only in the admin's export. */
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()),
    ingredients: z.array(ExportIngredient),
    instructions: z.array(z.strictObject({ stepNumber: z.number().int(), text: z.string() })),
  }),
});

/** One file of a batch export, named as the single export names it. */
export const CocktailExportFile = z.strictObject({
  filename: z.string(),
  data: CocktailExportFormat,
});

// What the preview sends back as `ref` for each entity (services/cocktail/importReferences.ts)

const UnitRef = z.strictObject({
  name: z.string().optional(),
  abbreviation: z.string(),
  conversionFactorToMl: z.number().nullable().optional(),
  nameTranslations: StoredTranslations,
});

const CategoryRef = z.strictObject({
  name: z.string(),
  type: z.string(),
  desiredStock: z.number().int(),
  nameTranslations: StoredTranslations.optional(),
});

const BottleRef = z.strictObject({
  name: z.string(),
  categoryName: z.string(),
  categoryType: z.string(),
});

const IngredientRef = z.strictObject({
  name: z.string(),
  icon: z.string().nullable(),
  nameTranslations: StoredTranslations,
});

/**
 * Each entity the recipe names, with the existing row it matches. The row of a unit is named
 * after its abbreviation, the value compared.
 */
export const ImportPreviewResponse = z.strictObject({
  cocktail: z.strictObject({
    name: z.string(),
    description: z.string().nullish(),
    /** As the file gives them: a hand-made file may give a comma-separated string. */
    tags: z.union([z.array(z.string()), z.string()]),
    /** A cocktail of the same name exists, whatever its case: only reported. */
    alreadyExists: z.boolean(),
  }),
  units: z.array(importMatch(UnitRef, Unit)),
  categories: z.array(importMatch(CategoryRef, Category)),
  bottles: z.array(importMatch(BottleRef, Bottle)),
  ingredients: z.array(importMatch(IngredientRef, Ingredient)),
});
