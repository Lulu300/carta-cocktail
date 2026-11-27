import { z } from 'zod';
import { Id, NullableDate, OptionalIntQuery, Percent, RequiredText, Timestamp } from './common';
import { Category } from './categories';
import { CategoryType } from './categoryTypes';

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
  format: z
    .string()
    .toLowerCase()
    .pipe(z.enum(['json', 'csv']))
    .default('json'),
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

/** A bottle as stored, without its relations. */
export const BottleRow = z.strictObject({
  id: Id,
  name: z.string(),
  categoryId: Id,
  purchasePrice: z.number().nullable(),
  capacityMl: z.number().int(),
  remainingPercent: z.number().int(),
  openedAt: Timestamp.nullable(),
  alcoholPercentage: z.number().nullable(),
  location: z.string().nullable(),
  isApero: z.boolean(),
  isDigestif: z.boolean(),
  createdAt: Timestamp,
});

/** A bottle as the admin routes send it, always with its category. */
export const Bottle = BottleRow.extend({ category: Category });

/** One category with its type and its bottles (GET /categories/:id). Here, as categories.ts cannot import bottles.ts. */
export const CategoryDetail = Category.extend({
  categoryType: CategoryType,
  bottles: z.array(BottleRow),
});
