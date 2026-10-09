import type { Cocktail, CocktailIngredient } from '../types';

type LocalizeName = (entity: {
  name: string;
  nameTranslations?: Record<string, string> | null;
}) => string;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

function getEntityNames(
  entity: { name: string; nameTranslations?: Record<string, string> | null } | null | undefined,
  localize: LocalizeName,
): string[] {
  if (!entity) return [];
  return [entity.name, localize(entity)];
}

function getIngredientNames(ingredient: CocktailIngredient, localize: LocalizeName): string[] {
  return [
    ...getEntityNames(ingredient.bottle, localize),
    ...getEntityNames(ingredient.bottle?.category, localize),
    ...getEntityNames(ingredient.category, localize),
    ...getEntityNames(ingredient.ingredient, localize),
  ];
}

interface CocktailSearchOptions {
  /** Notes are private: only the admin cocktail list may search them. */
  includeNotes?: boolean;
}

export function matchesCocktailSearch(
  cocktail: Cocktail,
  query: string,
  localize: LocalizeName,
  { includeNotes = false }: CocktailSearchOptions = {},
): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  // Off by default so a guest cannot probe the content of a note by typing words.
  const searchableText = normalize([
    cocktail.name,
    cocktail.description,
    includeNotes ? cocktail.notes : null,
    cocktail.tags,
    ...(cocktail.ingredients || []).flatMap((ingredient) => getIngredientNames(ingredient, localize)),
    ...(cocktail.instructions || []).map((instruction) => instruction.text),
  ].filter((value): value is string => Boolean(value)).join(' '));

  return terms.every((term) => searchableText.includes(term));
}
