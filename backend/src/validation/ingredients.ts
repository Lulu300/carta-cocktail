import { z } from 'zod';
import { RequiredText, Translations } from './common';

export const IngredientCreate = z.object({
  name: RequiredText,
  icon: z.string().nullish(),
  nameTranslations: Translations.optional(),
});

export const IngredientUpdate = IngredientCreate.partial().extend({
  isAvailable: z.boolean().optional(),
});

export const BulkAvailability = z.object({ available: z.boolean() });
