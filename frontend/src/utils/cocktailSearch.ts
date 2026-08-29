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

export function matchesCocktailSearch(
  cocktail: Cocktail,
  query: string,
  localize: LocalizeName,
): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = normalize([
    cocktail.name,
    cocktail.description,
    cocktail.notes,
    cocktail.tags,
    ...(cocktail.ingredients || []).flatMap((ingredient) => getIngredientNames(ingredient, localize)),
    ...(cocktail.instructions || []).map((instruction) => instruction.text),
  ].filter((value): value is string => Boolean(value)).join(' '));

  return terms.every((term) => searchableText.includes(term));
}
