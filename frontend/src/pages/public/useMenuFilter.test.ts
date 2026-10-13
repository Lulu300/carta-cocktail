import { describe, expect, it } from 'vitest';
import { renderHook } from '../../test/test-utils';
import {
  buildCategory,
  buildMenu,
  buildMenuBottle,
  buildMenuCocktail,
  buildMenuSection,
} from '../../test/factories';
import type { Bottle, Menu, MenuBottle, MenuCocktail } from '../../types';
import { groupMenuBottles, useMenuFilter } from './useMenuFilter';

function cocktailMenu(cocktails: MenuCocktail[], overrides: Partial<Menu> = {}): Menu {
  return buildMenu({ type: 'COCKTAILS', cocktails, ...overrides });
}

function filter(menu: Menu, query = '') {
  return renderHook(() => useMenuFilter(menu, query)).result.current;
}

const amer = buildCategory({ id: 1, name: 'Amer' });
const gin = buildCategory({ id: 2, name: 'Gin' });

/** Entry `id` of a bottle menu, holding bottle `id`, an "Amer" unless told otherwise. */
function menuBottle(id: number, bottle: Partial<Bottle> = {}): MenuBottle {
  return buildMenuBottle({ id, bottle: { id, name: 'Suze', category: amer, ...bottle } });
}

function bottleMenu(bottles: MenuBottle[]): Menu {
  return buildMenu({ type: 'APEROS', bottles });
}

describe('useMenuFilter on a bottle menu', () => {
  it('groups bottles by category when the menu has no sections', () => {
    const menu = bottleMenu([
      menuBottle(1, { name: 'Suze' }),
      menuBottle(2, { name: 'Tanqueray', categoryId: 2, category: gin }),
      menuBottle(3, { name: 'Picon' }),
    ]);

    const { bottleBlocks, cocktailBlocks, resultCount, hasItems } = filter(menu);

    expect(cocktailBlocks).toEqual([]);
    expect(bottleBlocks.map((block) => [block.kind, block.title, block.anchorId])).toEqual([
      ['category', 'Amer', 'section-category-1'],
      ['category', 'Gin', 'section-category-2'],
    ]);
    expect(bottleBlocks[0].items.map((row) => row.name)).toEqual(['Suze', 'Picon']);
    expect(resultCount).toBe(3);
    expect(hasItems).toBe(true);
  });

  it('orders the category blocks like the admin, by their first bottle, not by name', () => {
    const menu = bottleMenu([
      menuBottle(1, { name: 'Tanqueray', categoryId: 2, category: gin }),
      menuBottle(2, { name: 'Suze' }),
      menuBottle(3, { name: 'Hendrick\'s', categoryId: 2, category: gin }),
    ]);

    const { bottleBlocks } = filter(menu);

    expect(bottleBlocks.map((block) => block.title)).toEqual(['Gin', 'Amer']);
    expect(bottleBlocks[0].items.map((row) => row.name)).toEqual(['Tanqueray', 'Hendrick\'s']);
  });

  it('puts bottles without a category under "other"', () => {
    const menu = bottleMenu([menuBottle(1, { category: undefined })]);

    expect(filter(menu).bottleBlocks[0]).toMatchObject({ title: 'public.other', anchorId: 'section-category-other' });
  });

  it('keeps the admin order of the bottles inside a block', () => {
    const menu = bottleMenu([
      menuBottle(1, { name: 'Zubrowka' }),
      menuBottle(2, { name: 'Aperol' }),
      menuBottle(3, { name: 'Zubrowka' }),
    ]);

    const rows = filter(menu).bottleBlocks[0].items;

    expect(rows.map((row) => [row.name, row.count])).toEqual([['Zubrowka', 2], ['Aperol', 1]]);
  });

  it('finds a bottle without typing its accents', () => {
    const menu = bottleMenu([
      menuBottle(1, { name: 'Apéro maison' }),
      menuBottle(2, { name: 'Lillet' }),
    ]);

    const { bottleBlocks, resultCount } = filter(menu, 'apero');

    expect(bottleBlocks[0].items.map((row) => row.name)).toEqual(['Apéro maison']);
    expect(resultCount).toBe(1);
  });

  it('also searches the category name', () => {
    const menu = bottleMenu([
      menuBottle(1, { name: 'Tanqueray', categoryId: 2, category: gin }),
      menuBottle(2, { name: 'Suze' }),
    ]);

    expect(filter(menu, 'gin').bottleBlocks.map((block) => block.title)).toEqual(['Gin']);
  });
});

describe('useMenuFilter on a cocktail menu', () => {
  it('shows a menu without sections as one untitled list', () => {
    const menu = cocktailMenu([buildMenuCocktail({ id: 1 }), buildMenuCocktail({ id: 2, cocktail: { name: 'Negroni' } })]);

    const { cocktailBlocks } = filter(menu);

    expect(cocktailBlocks).toHaveLength(1);
    expect(cocktailBlocks[0]).toMatchObject({ kind: 'all', title: '', anchorId: 'section-all' });
    expect(cocktailBlocks[0].items).toHaveLength(2);
  });

  it('lists unsectioned cocktails first, then each section, and drops empty sections', () => {
    const menu = cocktailMenu(
      [
        buildMenuCocktail({ id: 1, menuSectionId: 20 }),
        buildMenuCocktail({ id: 2, cocktail: { name: 'Negroni' } }),
        buildMenuCocktail({ id: 3, cocktail: { name: 'Spritz' }, menuSectionId: 10 }),
      ],
      { sections: [buildMenuSection({ id: 10, name: 'Classics' }), buildMenuSection({ id: 20, name: 'Signatures' }), buildMenuSection({ id: 30, name: 'Empty' })] },
    );

    const { cocktailBlocks } = filter(menu);

    expect(cocktailBlocks.map((block) => [block.kind, block.title, block.anchorId])).toEqual([
      ['unsectioned', 'public.withoutSection', 'section-unsectioned'],
      ['section', 'Classics', 'section-10'],
      ['section', 'Signatures', 'section-20'],
    ]);
  });

  it('ignores hidden items and reports a menu with nothing to show', () => {
    const menu = cocktailMenu([buildMenuCocktail({ id: 1, isHidden: true })]);

    const { cocktailBlocks, resultCount, hasItems } = filter(menu);

    expect(cocktailBlocks).toEqual([]);
    expect(resultCount).toBe(0);
    expect(hasItems).toBe(false);
  });

  it('keeps only the matching cocktails and counts them', () => {
    const menu = cocktailMenu([
      buildMenuCocktail({ id: 1, cocktail: { description: 'Frais et pétillant' } }),
      buildMenuCocktail({ id: 2, cocktail: { name: 'Negroni', description: 'Amer' } }),
    ]);

    const { cocktailBlocks, resultCount, hasItems } = filter(menu, 'petillant');

    expect(cocktailBlocks[0].items.map((item) => item.cocktail?.name)).toEqual(['Mojito']);
    expect(resultCount).toBe(1);
    expect(hasItems).toBe(true);
  });
});

describe('groupMenuBottles', () => {
  it('merges identical bottles and sorts their locations by count', () => {
    const groups = groupMenuBottles([
      menuBottle(1, { name: 'Suze', location: 'Cave' }),
      menuBottle(2, { name: 'suze', location: 'Bar' }),
      menuBottle(3, { name: 'Suze', location: 'bar' }),
      menuBottle(4, { name: 'Suze', capacityMl: 350 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'Suze', count: 3 });
    expect(groups[0].locations).toEqual([{ name: 'Bar', count: 2 }, { name: 'Cave', count: 1 }]);
    expect(groups[1]).toMatchObject({ capacityMl: 350, count: 1, locations: [] });
  });
});
