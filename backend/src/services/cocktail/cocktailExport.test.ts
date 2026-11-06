import { describe, it, expect } from 'vitest';
import { buildCocktailExport, exportFilename, ExportedCocktail } from './cocktailExport';

const rum = { name: 'Rum', type: 'SPIRIT', nameTranslations: '{"fr":"Rhum","en":"Rum"}' };
const havana = { name: 'Havana Club', category: rum };
const centilitre = { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null };

function line(overrides: Partial<ExportedCocktail['ingredients'][number]>): ExportedCocktail['ingredients'][number] {
  return {
    sourceType: 'INGREDIENT', quantity: 1, position: 0, unit: centilitre,
    bottle: null, category: null, ingredient: null,
    ...overrides,
  };
}

const daiquiri: ExportedCocktail = {
  name: 'Daiquiri',
  description: 'Sour and fresh',
  notes: 'Use the good rum',
  tags: 'classic, sour,,',
  ingredients: [
    line({ sourceType: 'BOTTLE', quantity: 5, position: 0, bottle: havana }),
    line({ sourceType: 'CATEGORY', quantity: 2, position: 1, category: rum, preferredBottles: [{ bottle: havana }] }),
    line({
      sourceType: 'INGREDIENT', position: 2,
      ingredient: { name: 'Lime', icon: '🍋', nameTranslations: 'not json' },
    }),
  ],
  instructions: [{ stepNumber: 1, text: 'Shake' }],
};

describe('buildCocktailExport', () => {
  it('should write the version 1 format with every private field for the admin', () => {
    const payload = buildCocktailExport(daiquiri, { includePrivate: true });

    expect(payload.version).toBe(1);
    expect(Number.isNaN(Date.parse(payload.exportedAt))).toBe(false);
    expect(payload.cocktail).toEqual({
      name: 'Daiquiri',
      description: 'Sour and fresh',
      notes: 'Use the good rum',
      tags: ['classic', 'sour'],
      ingredients: [
        {
          sourceType: 'BOTTLE',
          sourceName: 'Havana Club',
          sourceDetail: { categoryName: 'Rum', categoryType: 'SPIRIT', categoryNameTranslations: { fr: 'Rhum', en: 'Rum' } },
          quantity: 5,
          unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
          position: 0,
          preferredBottles: [],
        },
        {
          sourceType: 'CATEGORY',
          sourceName: 'Rum',
          sourceDetail: { type: 'SPIRIT', nameTranslations: { fr: 'Rhum', en: 'Rum' } },
          quantity: 2,
          unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
          position: 1,
          preferredBottles: [{ name: 'Havana Club', categoryName: 'Rum' }],
        },
        {
          sourceType: 'INGREDIENT',
          sourceName: 'Lime',
          // Unreadable stored translations are exported as null
          sourceDetail: { icon: '🍋', nameTranslations: null },
          quantity: 1,
          unit: { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10, nameTranslations: null },
          position: 2,
          preferredBottles: [],
        },
      ],
      instructions: [{ stepNumber: 1, text: 'Shake' }],
    });
  });

  it('should leave notes and preferred bottles out of a guest export, and nothing else', () => {
    const admin = buildCocktailExport(daiquiri, { includePrivate: true });
    const guest = buildCocktailExport(daiquiri, { includePrivate: false });

    expect(guest.cocktail).not.toHaveProperty('notes');
    for (const exported of guest.cocktail.ingredients) expect(exported).not.toHaveProperty('preferredBottles');

    const { ingredients, ...adminRest } = admin.cocktail;
    const { ingredients: guestIngredients, ...guestRest } = guest.cocktail;
    expect({ ...guestRest, notes: admin.cocktail.notes }).toEqual(adminRest);
    expect(guestIngredients.map((exported, index) => ({ ...exported, preferredBottles: ingredients[index].preferredBottles })))
      .toEqual(ingredients);
  });

  it('should export empty fields as null or empty lists', () => {
    const payload = buildCocktailExport(
      { ...daiquiri, description: '', notes: null, tags: '', ingredients: [], instructions: [] },
      { includePrivate: true },
    );
    expect(payload.cocktail).toMatchObject({ description: null, notes: null, tags: [], ingredients: [], instructions: [] });
  });

  it('should export a line whose source is gone with an empty source name', () => {
    const payload = buildCocktailExport(
      { ...daiquiri, ingredients: [line({ sourceType: 'BOTTLE', bottle: null })] },
      { includePrivate: false },
    );
    expect(payload.cocktail.ingredients[0]).toMatchObject({ sourceType: 'BOTTLE', sourceName: '', sourceDetail: {} });
  });
});

describe('exportFilename', () => {
  it('should turn accented letters into their base letter', () => {
    expect(exportFilename('Piña Colada', 7)).toBe('cocktail-pina-colada.json');
    expect(exportFilename('Café Brûlot', 7)).toBe('cocktail-cafe-brulot.json');
  });

  it('should join words with single dashes and trim them at both ends', () => {
    expect(exportFilename('  Gin & Tonic!! ', 7)).toBe('cocktail-gin-tonic.json');
  });

  it('should fall back on the id for a name without latin letters or digits', () => {
    expect(exportFilename('モヒート', 42)).toBe('cocktail-42.json');
    expect(exportFilename('', 42)).toBe('cocktail-42.json');
    expect(exportFilename('***', 42)).toBe('cocktail-42.json');
  });
});
