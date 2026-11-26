/**
 * Tags of a cocktail, stored as one comma-separated string. Blank entries are
 * dropped, so an empty or missing string gives no tag.
 */
export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}
