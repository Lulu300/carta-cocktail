import { z } from 'zod';
import { Id, Percent, RequiredText, StoredTranslations, Timestamp, Translations } from './common';

export const DesiredStock = z.number().int().min(0);

// The type is kept as sent, on creation as on edit, and by the imports that create a category:
// data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT', and trimming would file a category
// picked under ' SPIRIT ' as 'SPIRIT'. ensureCategoryType keeps an existing type as it is, and
// tidies a new one (blank: 400). The empty name is refused even when a type has it: a category
// needs a type, as the category form says.
export const CategoryTypeName = z.string().min(1);

/**
 * Where the bottle and cocktail imports send the type of a category to create: both key their
 * category resolutions by name. The 400 of a blank new type points there.
 */
export function importedCategoryTypePath(key: string): PropertyKey[] {
  return ['body', 'resolutions', 'categories', key, 'data', 'type'];
}

export const CategoryCreate = z.object({
  name: RequiredText,
  type: CategoryTypeName,
  desiredStock: DesiredStock.optional(),
  minimumPercent: Percent.optional(),
  nameTranslations: Translations.optional(),
});

export const CategoryUpdate = CategoryCreate.partial();

/** A category as stored, without its relations. */
export const Category = z.strictObject({
  id: Id,
  name: z.string(),
  nameTranslations: StoredTranslations,
  type: z.string(),
  desiredStock: z.number().int(),
  minimumPercent: z.number().int(),
  createdAt: Timestamp,
});

/** What the public pages get of a category: its stock settings stay on the server. */
export const PublicCategory = Category.pick({
  id: true,
  name: true,
  nameTranslations: true,
  type: true,
});
