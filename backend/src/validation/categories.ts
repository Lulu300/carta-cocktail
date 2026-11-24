import { z } from 'zod';
import { Percent, RequiredText, Translations } from './common';

export const DesiredStock = z.number().int().min(0);

export const CategoryCreate = z.object({
  name: RequiredText,
  type: RequiredText,
  desiredStock: DesiredStock.optional(),
  minimumPercent: Percent.optional(),
  nameTranslations: Translations.optional(),
});

// An edit sends the type the category already has, kept as stored: data older than v1.9.0
// can hold ' SPIRIT ' next to 'SPIRIT', and trimming would move the category to 'SPIRIT'.
// The form trims a new type itself; creation keeps trimming.
export const CategoryUpdate = CategoryCreate.partial().extend({ type: z.string().min(1).optional() });
