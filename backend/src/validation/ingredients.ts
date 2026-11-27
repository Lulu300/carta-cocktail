import { z } from 'zod';
import { Id, RequiredText, StoredTranslations, Timestamp, Translations } from './common';

export const IngredientCreate = z.object({
  name: RequiredText,
  icon: z.string().nullish(),
  nameTranslations: Translations.optional(),
});

export const IngredientUpdate = IngredientCreate.partial().extend({
  isAvailable: z.boolean().optional(),
});

export const BulkAvailability = z.object({ available: z.boolean() });

export const Ingredient = z.strictObject({
  id: Id,
  name: z.string(),
  nameTranslations: StoredTranslations,
  icon: z.string().nullable(),
  isAvailable: z.boolean(),
  createdAt: Timestamp,
});

/** What the public pages get of an ingredient: its stock switch stays on the server. */
export const PublicIngredient = Ingredient.pick({
  id: true,
  name: true,
  nameTranslations: true,
  icon: true,
});
