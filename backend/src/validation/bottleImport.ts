import { z } from 'zod';
import { Id, NullableDate, Percent, RequiredText, Translations } from './common';
import { AlcoholPercentage, BottleQuantity, CapacityMl, PurchasePrice } from './bottles';
import { DesiredStock } from './categories';

// The payload is the one returned by POST /bottles/import/preview, sent back with
// the admin's choices. It goes through the same bounds as a bottle created by hand.

export const MAX_IMPORT_ROWS = 2000;

const ImportCategoryRecord = z.object({
  name: RequiredText,
  type: RequiredText,
  desiredStock: DesiredStock,
  minimumPercent: Percent,
  nameTranslations: Translations,
});

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
  bottles: z.array(ImportBottleRecord).max(MAX_IMPORT_ROWS),
});

// A resolution without its id or data is ignored, as before.
const CategoryResolution = z.discriminatedUnion('action', [
  z.object({ action: z.literal('use_existing'), existingId: Id.optional() }),
  z.object({
    action: z.literal('create'),
    data: z
      .object({
        name: RequiredText.optional(),
        type: RequiredText.default('SPIRIT'),
        desiredStock: DesiredStock.default(1),
        minimumPercent: Percent.default(30),
        nameTranslations: Translations.optional(),
      })
      .optional(),
  }),
]);

const BottleResolution = z.discriminatedUnion('action', [
  z.object({ action: z.literal('import'), categoryName: z.string().optional() }),
  z.object({ action: z.literal('skip') }),
]);

export const BottleImportConfirm = z.object({
  payload: BottleImportPayload,
  resolutions: z
    .object({
      // Keyed by category name
      categories: z.record(z.string(), CategoryResolution).optional(),
      // Keyed by the row index in payload.bottles
      bottles: z.record(z.string(), BottleResolution).optional(),
    })
    .optional(),
});
