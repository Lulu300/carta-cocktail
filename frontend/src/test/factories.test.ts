import { describe, expect, it } from 'vitest';
import {
  buildAvailability,
  buildBottle,
  buildCategory,
  buildCategoryType,
  buildCocktail,
  buildIngredient,
  buildMenu,
  buildMenuBottle,
  buildMenuCocktail,
  buildMenuSection,
  buildShortage,
  buildSiteSettings,
  buildUnit,
  resetFactories,
} from './factories';

describe('factories', () => {
  it.each([
    ['bottle', buildBottle],
    ['category', buildCategory],
    ['cocktail', buildCocktail],
    ['ingredient', buildIngredient],
    ['menu', buildMenu],
    ['menu bottle', buildMenuBottle],
    ['menu cocktail', buildMenuCocktail],
    ['menu section', buildMenuSection],
    ['unit', buildUnit],
  ])('gives each %s its own id, starting from 1', (_entity, build) => {
    expect([build().id, build().id, build().id]).toEqual([1, 2, 3]);
  });

  it('keeps names unique once the pool of realistic names is used up', () => {
    const names = Array.from({ length: 12 }, () => buildCocktail().name);

    expect(new Set(names).size).toBe(12);
    expect(names[0]).toBe('Mojito');
    expect(names[5]).toBe('Mojito 6');
  });

  it('applies overrides and does not use up an id when one is given', () => {
    const bottle = buildBottle({ id: 42, name: 'Hendrick’s', remainingPercent: 30 });

    expect(bottle).toMatchObject({ id: 42, name: 'Hendrick’s', remainingPercent: 30, capacityMl: 700 });
    expect(buildBottle().id).toBe(1);
  });

  it('links a bottle to the category it is given', () => {
    const category = buildCategory({ id: 7 });

    expect(buildBottle({ category }).categoryId).toBe(7);
  });

  it('links menu entries to the cocktail or bottle they hold', () => {
    const cocktail = buildCocktail({ id: 5 });
    const bottle = buildBottle({ id: 9 });

    expect(buildMenuCocktail({ cocktail }).cocktailId).toBe(5);
    expect(buildMenuBottle({ bottle }).bottleId).toBe(9);
    expect(buildMenuBottle().bottle?.isApero).toBe(true);
  });

  it('derives the menu slug from its name', () => {
    expect(buildMenu({ name: 'Carte d’été 2026' }).slug).toBe('carte-d-ete-2026');
  });

  it('builds category types, shortages, availabilities and site settings', () => {
    expect(buildCategoryType()).toEqual({ name: 'SPIRIT', nameTranslations: null, color: 'blue' });
    expect(buildCategoryType().name).toBe('SYRUP');
    expect(buildShortage().totalPercent).toBeLessThan(buildShortage().requiredPercent);
    expect(buildAvailability({ cocktailId: 3 })).toMatchObject({ cocktailId: 3, isAvailable: true });
    expect(buildSiteSettings({ siteName: 'Bar' }).siteName).toBe('Bar');
  });

  it('restarts every id sequence on reset', () => {
    buildUnit();
    buildUnit();
    buildCategoryType();
    resetFactories();

    expect(buildUnit().id).toBe(1);
    expect(buildCategoryType().name).toBe('SPIRIT');
  });
});
