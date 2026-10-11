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

export const CategoryUpdate = CategoryCreate.partial();
