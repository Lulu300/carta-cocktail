import { describe, expect, it } from 'vitest';
import type { Cocktail } from '../types';
import { matchesCocktailSearch } from './cocktailSearch';

const localize = (entity: { name: string; nameTranslations?: Record<string, string> | null }) =>
  entity.nameTranslations?.fr || entity.name;

function cocktail(overrides: Partial<Cocktail> = {}): Cocktail {
  return {
    id: 1,
    name: 'Mojito',
    description: 'Un cocktail frais',
    notes: null,
    imagePath: null,
    tags: 'rhum,tiki',
    isAvailable: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ingredients: [],
    instructions: [],
    ...overrides,
  };
}

describe('matchesCocktailSearch', () => {
  it('matches every search term across different recipe fields', () => {
    const item = cocktail({
      ingredients: [{
        id: 1,
        cocktailId: 1,
        quantity: 2,
        unitId: 1,
        sourceType: 'INGREDIENT',
        bottleId: null,
        categoryId: null,
        ingredientId: 1,
        ingredient: {
          id: 1,
          name: 'Lime',
          nameTranslations: { fr: 'Citron vert' },
          icon: null,
          isAvailable: true,
          createdAt: '2024-01-01',
        },
        position: 0,
      }],
    });

    expect(matchesCocktailSearch(item, 'rhum citron', localize)).toBe(true);
    expect(matchesCocktailSearch(item, 'rhum menthe', localize)).toBe(false);
  });

  it('ignores case, accents, and punctuation', () => {
    const item = cocktail({ notes: 'Décorer avec du citron' });

    expect(matchesCocktailSearch(item, 'DÉCORER, CITRON', localize)).toBe(true);
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
});
