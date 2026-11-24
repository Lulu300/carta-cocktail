import { z } from 'zod';
import { RequiredText, Translations } from './common';

// The name in the path is the key of an existing type, kept as stored: it is not trimmed.
// Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT', and a trimmed key would
// edit or delete 'SPIRIT' instead.
export const CategoryTypeParams = z.object({ name: z.string().min(1) });

export const CategoryTypeCreate = z.object({
  name: RequiredText,
  nameTranslations: Translations.optional(),
  color: z.string().optional(),
});

export const CategoryTypeUpdate = CategoryTypeCreate.omit({ name: true });
