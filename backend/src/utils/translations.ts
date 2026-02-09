/**
 * Recursively parse nameTranslations JSON strings in entity objects.
 * Prisma with SQLite stores JSON fields as plain strings, so we need
 * to parse them before sending to the client.
 */
export function parseNameTranslations(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(parseNameTranslations);

  if (typeof obj === 'object') {
    if (typeof obj.nameTranslations === 'string') {
      try {
        obj.nameTranslations = JSON.parse(obj.nameTranslations);
      } catch {
        obj.nameTranslations = null;
      }
    }
    // Recurse into known relation fields
    for (const key of [
      'unit', 'category', 'categoryType', 'ingredient', 'bottle', 'bottles',
      'ingredients', 'cocktail', 'cocktails', 'preferredBottles',
    ]) {
      if (obj[key]) {
        obj[key] = parseNameTranslations(obj[key]);
      }
    }
  }
  return obj;
}
