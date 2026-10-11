import { describe, expect, it } from 'vitest';
import { renderHook } from '../../test/test-utils';
import {
  bottleMenu,
  category,
  cocktailMenu,
  menuBottle,
  menuCocktail,
  section,
} from '../../test/publicMenuFixtures';
import type { Menu } from '../../types';
import { groupMenuBottles, useMenuFilter } from './useMenuFilter';

function filter(menu: Menu, query = '') {
  return renderHook(() => useMenuFilter(menu, query)).result.current;
}

const gin = category({ id: 2, name: 'Gin' });

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
    const menu = cocktailMenu([menuCocktail(1), menuCocktail(2, { name: 'Negroni' })]);

    const { cocktailBlocks } = filter(menu);

    expect(cocktailBlocks).toHaveLength(1);
    expect(cocktailBlocks[0]).toMatchObject({ kind: 'all', title: '', anchorId: 'section-all' });
    expect(cocktailBlocks[0].items).toHaveLength(2);
  });

  it('lists unsectioned cocktails first, then each section, and drops empty sections', () => {
    const menu = cocktailMenu(
      [
        menuCocktail(1, {}, { menuSectionId: 20 }),
        menuCocktail(2, { name: 'Negroni' }),
        menuCocktail(3, { name: 'Spritz' }, { menuSectionId: 10 }),
      ],
      { sections: [section(10, 'Classics'), section(20, 'Signatures'), section(30, 'Empty')] },
    );

    const { cocktailBlocks } = filter(menu);

    expect(cocktailBlocks.map((block) => [block.kind, block.title, block.anchorId])).toEqual([
      ['unsectioned', 'public.withoutSection', 'section-unsectioned'],
      ['section', 'Classics', 'section-10'],
      ['section', 'Signatures', 'section-20'],
    ]);
  });

  it('ignores hidden items and reports a menu with nothing to show', () => {
    const menu = cocktailMenu([menuCocktail(1, {}, { isHidden: true })]);

    const { cocktailBlocks, resultCount, hasItems } = filter(menu);

    expect(cocktailBlocks).toEqual([]);
    expect(resultCount).toBe(0);
    expect(hasItems).toBe(false);
  });

  it('keeps only the matching cocktails and counts them', () => {
    const menu = cocktailMenu([
      menuCocktail(1, { description: 'Frais et pétillant' }),
      menuCocktail(2, { name: 'Negroni', description: 'Amer' }),
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
