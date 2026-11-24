import { z } from 'zod';
import { Percent, RequiredText, Translations } from './common';

export const DesiredStock = z.number().int().min(0);

// The type is kept as sent, on creation as on edit: data older than v1.9.0 can hold ' SPIRIT '
// next to 'SPIRIT', and trimming would file a category picked under ' SPIRIT ' as 'SPIRIT'.
// ensureCategoryType keeps an existing type as it is, and tidies a new one (blank: 400).
const CategoryTypeName = z.string().min(1);

export const CategoryCreate = z.object({
  name: RequiredText,
  type: CategoryTypeName,
  desiredStock: DesiredStock.optional(),
  minimumPercent: Percent.optional(),
  nameTranslations: Translations.optional(),
});

export const CategoryUpdate = CategoryCreate.partial();
