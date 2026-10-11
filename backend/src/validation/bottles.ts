import { z } from 'zod';
import { Id, NullableDate, OptionalIntQuery, Percent, RequiredText } from './common';

export const CapacityMl = z.number().int().positive();
export const AlcoholPercentage = z.number().min(0).max(100).nullable();
// 0 is a valid price (a gift) and must be kept
export const PurchasePrice = z.number().min(0).nullable();
export const BottleQuantity = z.number().int().min(1).max(50);

export const BottleListQuery = z.object({
  categoryId: OptionalIntQuery,
  type: z.string().optional(),
});

export const BottleExportQuery = BottleListQuery.extend({
  location: z.string().optional(),
  search: z.string().optional(),
  // Case-insensitive, as before
  format: z.string().toLowerCase().pipe(z.enum(['json', 'csv'])).default('json'),
});

const BottleFields = z.object({
  name: RequiredText,
  categoryId: Id,
  capacityMl: CapacityMl,
  remainingPercent: Percent.optional(),
  purchasePrice: PurchasePrice.optional(),
  alcoholPercentage: AlcoholPercentage.optional(),
  openedAt: NullableDate.optional(),
  location: z.string().nullish(),
  isApero: z.boolean().optional(),
  isDigestif: z.boolean().optional(),
});

/** `quantity` creates that many identical bottles at once. */
export const BottleCreate = BottleFields.extend({
  quantity: BottleQuantity.optional(),
});

export const BottleUpdate = BottleFields.partial();
