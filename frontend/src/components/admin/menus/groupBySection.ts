import type { MenuSection } from '../../../types';
import { moveItem } from './moveItem';

export interface SectionGroup<T> {
  /** Null for the items outside any section. */
  section: MenuSection | null;
  items: T[];
}

/**
 * The items of a menu under their section, in display order: the items outside
 * any section first, then every section in the given order, empty ones included.
 * An item whose section no longer exists counts as outside any section.
 */
export function groupBySection<T extends { menuSectionId: number | null }>(
  items: T[],
  sections: MenuSection[],
): SectionGroup<T>[] {
  const sectionIds = new Set(sections.map((section) => section.id));
  const isInSection = (item: T) => item.menuSectionId !== null && sectionIds.has(item.menuSectionId);

  return [
    { section: null, items: items.filter((item) => !isInSection(item)) },
    ...sections.map((section) => ({
      section,
      items: items.filter((item) => item.menuSectionId === section.id),
    })),
  ];
}

/**
 * Every item of the menu in display order, after moving one item inside the
 * group at `groupIndex`: the full new order that the server stores.
 */
export function moveWithinGroup<T>(groups: SectionGroup<T>[], groupIndex: number, from: number, to: number): T[] {
  return groups.flatMap((group, index) => (index === groupIndex ? moveItem(group.items, from, to) : group.items));
}
