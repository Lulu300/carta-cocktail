import type { Bottle, Category, Cocktail, Menu, MenuBottle, MenuCocktail, MenuSection } from '../types';

/** Builders for public menu payloads, as served by GET /api/public/menus/:slug. */

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Amer',
    type: 'SPIRIT',
    desiredStock: 1,
    minimumPercent: 30,
    createdAt: '2024-01-01',
    ...overrides,
  };
}

export function bottle(overrides: Partial<Bottle> = {}): Bottle {
  return {
    id: 1,
    name: 'Suze',
    categoryId: 1,
    category: category(),
    purchasePrice: null,
    capacityMl: 700,
    remainingPercent: 100,
    openedAt: null,
    alcoholPercentage: 20,
    location: null,
    isApero: true,
    isDigestif: false,
    createdAt: '2024-01-01',
    ...overrides,
  };
}

export function menuBottle(id: number, bottleOverrides: Partial<Bottle> = {}, overrides: Partial<MenuBottle> = {}): MenuBottle {
  return {
    id,
    menuId: 1,
    bottleId: id,
    menuSectionId: null,
    position: id,
    isHidden: false,
    bottle: bottle({ id, ...bottleOverrides }),
    ...overrides,
  };
}

export function cocktail(overrides: Partial<Cocktail> = {}): Cocktail {
  return {
    id: 1,
    name: 'Mojito',
    description: null,
    notes: null,
    imagePath: null,
    tags: '',
    isAvailable: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ingredients: [],
    instructions: [],
    ...overrides,
  };
}

export function menuCocktail(id: number, cocktailOverrides: Partial<Cocktail> = {}, overrides: Partial<MenuCocktail> = {}): MenuCocktail {
  return {
    id,
    menuId: 2,
    cocktailId: id,
    menuSectionId: null,
    position: id,
    isHidden: false,
    cocktail: cocktail({ id, ...cocktailOverrides }),
    ...overrides,
  };
}

export function section(id: number, name: string): MenuSection {
  return { id, menuId: 2, name, position: id };
}

export function bottleMenu(bottles: MenuBottle[], overrides: Partial<Menu> = {}): Menu {
  return {
    id: 1,
    name: 'Apéritifs',
    description: null,
    slug: 'aperitifs',
    type: 'APEROS',
    isPublic: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    sections: [],
    cocktails: [],
    bottles,
    ...overrides,
  };
}

export function cocktailMenu(cocktails: MenuCocktail[], overrides: Partial<Menu> = {}): Menu {
  return {
    id: 2,
    name: 'Cocktails',
    description: null,
    slug: 'cocktails',
    type: 'COCKTAILS',
    isPublic: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    sections: [],
    bottles: [],
    cocktails,
    ...overrides,
  };
}
