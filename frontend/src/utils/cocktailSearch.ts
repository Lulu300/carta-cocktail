import type { Cocktail, CocktailIngredient } from '../types';

type NamedEntity = { name: string; nameTranslations?: Record<string, string> | null };

export type LocalizeName = (entity: NamedEntity) => string;

/** Lower case, without accents or punctuation: "Apéro-Spritz!" becomes "apero spritz". */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

/** Raw and localized names, so a search matches in any language. */
export function getEntityNames(entity: NamedEntity | null | undefined, localize: LocalizeName): string[] {
  if (!entity) return [];
  return [entity.name, localize(entity)];
}

/** Normalized text built from several values, to be matched with `matchesSearchText`. */
export function buildSearchText(values: (string | null | undefined)[]): string {
  return normalize(values.filter((value): value is string => Boolean(value)).join(' '));
}

/** True when every word of the query appears in a text built by `buildSearchText`. */
export function matchesSearchText(searchText: string, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => searchText.includes(term));
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

/** Searchable text of a cocktail; compute it once per cocktail when filtering on every keystroke. */
export function getCocktailSearchText(
  cocktail: Cocktail,
  localize: LocalizeName,
  { includeNotes = false }: CocktailSearchOptions = {},
): string {
  // Off by default so a guest cannot probe the content of a note by typing words.
  return buildSearchText([
    cocktail.name,
    cocktail.description,
    includeNotes ? cocktail.notes : null,
    cocktail.tags,
    ...(cocktail.ingredients || []).flatMap((ingredient) => getIngredientNames(ingredient, localize)),
    ...(cocktail.instructions || []).map((instruction) => instruction.text),
  ]);
}

export function matchesCocktailSearch(
  cocktail: Cocktail,
  query: string,
  localize: LocalizeName,
  options: CocktailSearchOptions = {},
): boolean {
  return matchesSearchText(getCocktailSearchText(cocktail, localize, options), query);
}
