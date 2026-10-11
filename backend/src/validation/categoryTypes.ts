import { z } from 'zod';
import { RequiredText, Translations } from './common';

export const CategoryTypeParams = z.object({ name: RequiredText });

export const CategoryTypeCreate = z.object({
  name: RequiredText,
  nameTranslations: Translations.optional(),
  color: z.string().optional(),
});

export const CategoryTypeUpdate = CategoryTypeCreate.omit({ name: true });
