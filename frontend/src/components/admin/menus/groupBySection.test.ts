import { describe, it, expect } from 'vitest';
import type { MenuSection } from '../../../types';
import { groupBySection, moveWithinGroup } from './groupBySection';

const starters: MenuSection = { id: 1, menuId: 5, name: 'Starters', position: 0 };
const classics: MenuSection = { id: 2, menuId: 5, name: 'Classics', position: 1 };

function item(name: string, menuSectionId: number | null) {
  return { name, menuSectionId };
}

describe('groupBySection', () => {
  it('puts the items outside any section first, then each section in order', () => {
    const items = [item('a', 2), item('b', null), item('c', 1), item('d', 2)];

    const groups = groupBySection(items, [starters, classics]);

    expect(groups.map((group) => group.section?.name ?? null)).toEqual([null, 'Starters', 'Classics']);
    expect(groups.map((group) => group.items.map((entry) => entry.name))).toEqual([['b'], ['c'], ['a', 'd']]);
  });

  it('keeps empty sections and an empty group outside any section', () => {
    const groups = groupBySection([item('a', 1)], [starters, classics]);

    expect(groups[0]).toEqual({ section: null, items: [] });
    expect(groups[2]).toEqual({ section: classics, items: [] });
  });

  it('counts an item of a deleted section as outside any section', () => {
    const groups = groupBySection([item('a', 99)], [starters]);

    expect(groups[0].items.map((entry) => entry.name)).toEqual(['a']);
    expect(groups[1].items).toEqual([]);
  });

  it('returns a single group when the menu has no section', () => {
    expect(groupBySection([item('a', null)], [])).toEqual([{ section: null, items: [item('a', null)] }]);
  });
});

describe('moveWithinGroup', () => {
  const groups = groupBySection([item('a', null), item('b', 1), item('c', 1), item('d', 2)], [starters, classics]);

  it('returns every item in display order with one item moved inside its group', () => {
    expect(moveWithinGroup(groups, 1, 1, 0).map((entry) => entry.name)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps the order when the move leaves the group', () => {
    expect(moveWithinGroup(groups, 2, 0, 1).map((entry) => entry.name)).toEqual(['a', 'b', 'c', 'd']);
  });
});
