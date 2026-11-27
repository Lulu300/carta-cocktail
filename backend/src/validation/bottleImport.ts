import { z } from 'zod';
import {
  Id,
  importMatch,
  NullableDate,
  Percent,
  RequiredText,
  StoredTranslations,
  Timestamp,
  Translations,
} from './common';
import { AlcoholPercentage, BottleQuantity, CapacityMl, PurchasePrice } from './bottles';
import { CategoryTypeName, DesiredStock } from './categories';

// The payload is the one returned by POST /bottles/import/preview, sent back with
// the admin's choices. It goes through the same bounds as a bottle created by hand.

export const MAX_IMPORT_ROWS = 2000;
/** Bottles one import can create, quantities included: keeps the transaction short. */
export const MAX_IMPORT_BOTTLES = 2000;

const ImportCategoryRecord = z.object({
  name: RequiredText,
  type: RequiredText,
  desiredStock: DesiredStock,
  minimumPercent: Percent,
  nameTranslations: Translations,
});

/** Number of bottles the rows create, each row standing for `quantity` identical bottles. */
export function totalQuantity(rows: { quantity: number }[]): number {
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

const ImportBottleRecord = z.object({
  name: RequiredText,
  // Empty when the file gives no category: the admin picks one in the resolutions
  categoryName: z.string(),
  capacityMl: CapacityMl,
  remainingPercent: Percent.default(100),
  alcoholPercentage: AlcoholPercentage.default(null),
  purchasePrice: PurchasePrice.default(null),
  location: z.string().nullable().default(null),
  openedAt: NullableDate.default(null),
  isApero: z.boolean().default(false),
  isDigestif: z.boolean().default(false),
  quantity: BottleQuantity.default(1),
});

export const BottleImportPayload = z.object({
  version: z.literal(1),
  categories: z.array(ImportCategoryRecord).max(MAX_IMPORT_ROWS).default([]),
  bottles: z
    .array(ImportBottleRecord)
    .max(MAX_IMPORT_ROWS)
    .refine((bottles) => totalQuantity(bottles) <= MAX_IMPORT_BOTTLES, {
      message: `More than ${MAX_IMPORT_BOTTLES} bottles`,
    }),
});

// A resolution without its id or data is ignored, as before.
const CategoryResolution = z.discriminatedUnion('action', [
  z.object({ action: z.literal('use_existing'), existingId: Id.optional() }),
  z.object({
    action: z.literal('create'),
    data: z
      .object({
        // Blank or absent: the route uses the category name of the file
        name: z.string().trim().optional(),
        type: CategoryTypeName.default('SPIRIT'),
        desiredStock: DesiredStock.default(1),
        minimumPercent: Percent.default(30),
        nameTranslations: Translations.optional(),
      })
      .optional(),
  }),
]);

const BottleResolution = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('import'),
    // An existing category, by id: a name can lead elsewhere when a category of the file with that
    // name, ignoring case, is resolved to another one. Takes precedence over `categoryName`.
    categoryId: Id.optional(),
    // A category created by the import, or any category by name (older clients)
    categoryName: z.string().optional(),
  }),
  z.object({ action: z.literal('skip') }),
]);

/** What the admin chose for the categories of the file, keyed by category name. */
export const BottleCategoryResolutions = z.record(z.string(), CategoryResolution);

/** What the admin chose for the rows of the file, keyed by the row index in payload.bottles. */
export const BottleRowResolutions = z.record(z.string(), BottleResolution);

export const BottleImportConfirm = z.object({
  payload: BottleImportPayload,
  resolutions: z
    .object({
      categories: BottleCategoryResolutions.optional(),
      bottles: BottleRowResolutions.optional(),
    })
    .optional(),
});

// Responses of the import preview and confirmation, and of the JSON export (utils/bottlesExport.ts)

const ImportRowSource = z.enum(['bottles', 'categories']);

/** A category of the file, as the preview reads it. */
export const BottleImportCategoryRecord = z.strictObject({
  name: z.string(),
  type: z.string(),
  desiredStock: z.number().int(),
  minimumPercent: z.number().int(),
  nameTranslations: Translations,
});

/** A row of the file, standing for `quantity` identical bottles. */
export const BottleImportRecord = z.strictObject({
  name: z.string(),
  /** Empty when the file gives no category: the admin picks one. */
  categoryName: z.string(),
  capacityMl: z.number().int(),
  remainingPercent: z.number().int(),
  alcoholPercentage: z.number().nullable(),
  purchasePrice: z.number().nullable(),
  location: z.string().nullable(),
  openedAt: z.string().nullable(),
  isApero: z.boolean(),
  isDigestif: z.boolean(),
  quantity: z.number().int(),
});

/** The file as the preview reads it: the confirmation gets it back unchanged. */
export const BottleImportPreviewPayload = z.strictObject({
  version: z.literal(1),
  categories: z.array(BottleImportCategoryRecord),
  bottles: z.array(BottleImportRecord),
});

export const BottleImportRowErrorCode = z.enum([
  'required',
  'outOfRange',
  'invalidDate',
  'invalidNumber',
  'malformedQuotes',
]);

/**
 * A row of the file left out of the import. `line` is the CSV line (header = 1) or the position
 * in the JSON list (first = 1), within `source`. A CSV cell past the last named column has an
 * empty `field`, and its `column` number (first = 1).
 */
export const BottleImportRowError = z.strictObject({
  source: ImportRowSource,
  line: z.number().int(),
  field: z.string(),
  column: z.number().int().optional(),
  code: BottleImportRowErrorCode,
});

/**
 * A value of a row the import keeps as it is, but that the admin should check, located like a
 * row error. `lineBreak`: a line break in a single-line text field.
 */
export const BottleImportRowWarning = z.strictObject({
  source: ImportRowSource,
  line: z.number().int(),
  field: z.string(),
  code: z.literal('lineBreak'),
});

const ExistingCategory = z.strictObject({
  id: Id,
  name: z.string(),
  type: z.string(),
  desiredStock: z.number().int(),
});

export const BottleCategoryPreview = importMatch(BottleImportCategoryRecord, ExistingCategory);

/** An existing bottle of the same name, capacity and category as a row. */
export const BottleDuplicateEntry = z.strictObject({
  id: Id,
  name: z.string(),
  capacityMl: z.number().int(),
  categoryName: z.string(),
  remainingPercent: z.number().int(),
});

export const BottleRowPreview = z.strictObject({
  ref: BottleImportRecord,
  needsCategory: z.boolean(),
  potentialDuplicates: z.array(BottleDuplicateEntry),
});

export const BottleImportPreviewResponse = z.strictObject({
  payload: BottleImportPreviewPayload,
  categories: z.array(BottleCategoryPreview),
  bottles: z.array(BottleRowPreview),
  errors: z.array(BottleImportRowError),
  warnings: z.array(BottleImportRowWarning),
});

export const BottleImportConfirmResponse = z.strictObject({
  created: z.strictObject({ bottles: z.number().int() }),
  duplicatesCreated: z.number().int(),
  skippedNoCategory: z.number().int(),
});

/** GET /bottles/export?format=json. The frontend only downloads it, as a file. */
export const BottlesExport = z.strictObject({
  version: z.literal(1),
  exportedAt: Timestamp,
  categories: z.array(BottleImportCategoryRecord.extend({ nameTranslations: StoredTranslations })),
  bottles: z.array(BottleImportRecord),
});
