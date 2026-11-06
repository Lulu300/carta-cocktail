import { isRecord } from './records';

/** Relation fields that may hold entities with their own nameTranslations. */
const RELATION_KEYS = [
  'unit', 'category', 'categoryType', 'ingredient', 'bottle', 'bottles',
  'ingredients', 'cocktail', 'cocktails', 'preferredBottles',
];

/**
 * Recursively parse nameTranslations JSON strings in entity objects, in place.
 * Prisma with SQLite stores JSON fields as plain strings, so we need
 * to parse them before sending to the client.
 *
 * The result only goes to `res.json()`, and its shape is no longer the input's
 * (a string became an object): it is `unknown` rather than the input type.
 */
export function parseNameTranslations(value: unknown): unknown {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(parseNameTranslations);
  if (!isRecord(value)) return value;

  if (typeof value.nameTranslations === 'string') {
    try {
      value.nameTranslations = JSON.parse(value.nameTranslations);
    } catch {
      value.nameTranslations = null;
    }
  }
  for (const key of RELATION_KEYS) {
    if (value[key]) {
      value[key] = parseNameTranslations(value[key]);
    }
  }
  return value;
}
