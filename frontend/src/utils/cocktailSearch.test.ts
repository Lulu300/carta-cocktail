import { describe, expect, it } from 'vitest';
import { buildCocktail, buildCocktailIngredient, buildIngredient } from '../test/factories';
import type { Cocktail } from '../types';
import { buildSearchText, matchesCocktailSearch, matchesSearchText, normalize } from './cocktailSearch';

const localize = (entity: { name: string; nameTranslations?: Record<string, string> | null }) =>
  entity.nameTranslations?.fr || entity.name;

function cocktail(overrides: Partial<Cocktail> = {}): Cocktail {
  return buildCocktail({ id: 1, name: 'Mojito', description: 'Un cocktail frais', tags: 'rhum,tiki', ...overrides });
}

describe('matchesCocktailSearch', () => {
  it('matches every search term across different recipe fields', () => {
    const item = cocktail({
      ingredients: [buildCocktailIngredient({
        id: 1,
        ingredient: buildIngredient({ id: 1, name: 'Lime', nameTranslations: { fr: 'Citron vert' } }),
      })],
    });

    expect(matchesCocktailSearch(item, 'rhum citron', localize)).toBe(true);
    expect(matchesCocktailSearch(item, 'rhum menthe', localize)).toBe(false);
  });

  it('ignores case, accents, and punctuation', () => {
    const item = cocktail({ description: 'Décorer avec du citron' });

    expect(matchesCocktailSearch(item, 'DÉCORER, CITRON', localize)).toBe(true);
  });

  it('does not search private notes by default', () => {
    const item = cocktail({ notes: 'Recette secrète du patron' });

    expect(matchesCocktailSearch(item, 'patron', localize)).toBe(false);
  });

  it('searches notes when explicitly asked (admin list)', () => {
    const item = cocktail({ notes: 'Recette secrète du patron' });

    expect(matchesCocktailSearch(item, 'patron', localize, { includeNotes: true })).toBe(true);
  });

  it('searches preparation instructions', () => {
    const item = cocktail({
      instructions: [{ id: 1, cocktailId: 1, stepNumber: 1, text: 'Shaker avec des glaçons' }],
    });

    expect(matchesCocktailSearch(item, 'rhum shaker', localize)).toBe(true);
  });

  it('accepts an empty query', () => {
    expect(matchesCocktailSearch(cocktail(), '   ', localize)).toBe(true);
  });

  it('searches a cocktail sent without its ingredients and steps', () => {
    const item = cocktail({ ingredients: undefined, instructions: undefined });

    expect(matchesCocktailSearch(item, 'mojito tiki', localize)).toBe(true);
    expect(matchesCocktailSearch(item, 'citron', localize)).toBe(false);
  });
});

describe('normalize', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalize('Apéro-Spritz !')).toBe('apero spritz');
    expect(normalize('  Crème de Cassis  ')).toBe('creme de cassis');
  });
});

describe('matchesSearchText', () => {
  it('matches every word of the query against a prepared text, whatever the accents', () => {
    const text = buildSearchText(['Apéro maison', null, 'Amer']);

    expect(text).toBe('apero maison amer');
    expect(matchesSearchText(text, 'APÉRO amer')).toBe(true);
    expect(matchesSearchText(text, 'apero gin')).toBe(false);
    expect(matchesSearchText(text, '')).toBe(true);
  });
});
