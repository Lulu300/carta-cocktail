import type { MenuBottleExclusion } from '../../../services/api';
import type { Bottle, MenuBottle } from '../../../types';
import { bottleGroupKey } from '../../../utils/bottleGrouping';

/** An entry of a menu with its bottle, as the menu endpoint returns it. */
export type MenuBottleEntry = MenuBottle & { bottle: Bottle };

/** Identical bottles of one section of a menu, shown and changed as one row. */
export interface MenuBottleGroup {
  key: string;
  /** The first bottle of the group, for its name, category and strength. */
  bottle: Bottle;
  entries: MenuBottleEntry[];
  menuSectionId: number | null;
  /** Hidden only when every bottle of the group is. */
  isHidden: boolean;
  /** Every bottle of the group is empty: it stays in the menu, hidden from guests. */
  isEmpty: boolean;
  /** False while a bottle put back in the menu waits for its id from the server. */
  isSaved: boolean;
}

/** Identical bottles removed from a system menu, shown and put back as one row. */
export interface ExcludedBottleGroup {
  key: string;
  bottle: Bottle;
  exclusions: MenuBottleExclusion[];
  isEmpty: boolean;
}

export function hasBottle(entry: MenuBottle): entry is MenuBottleEntry {
  return entry.bottle !== undefined;
}

/** Entries not saved yet get a temporary negative id (see useMenuBottles). */
export function isSavedEntry(entry: MenuBottle): boolean {
  return entry.id > 0;
}

export function isEmptyBottle(bottle: Bottle): boolean {
  return bottle.remainingPercent === 0;
}

/** Groups the items by key, keeping the order of the first item of each group. */
function groupByKey<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups];
}

/** Groups identical bottles of the same section. */
export function groupMenuBottles(entries: MenuBottleEntry[]): MenuBottleGroup[] {
  const sectionAndBottle = (entry: MenuBottleEntry) => `${bottleGroupKey(entry.bottle)}|${entry.menuSectionId ?? ''}`;

  return groupByKey(entries, sectionAndBottle).map(([key, groupEntries]) => ({
    key,
    bottle: groupEntries[0].bottle,
    entries: groupEntries,
    menuSectionId: groupEntries[0].menuSectionId,
    isHidden: groupEntries.every((entry) => entry.isHidden),
    isEmpty: groupEntries.every((entry) => isEmptyBottle(entry.bottle)),
    isSaved: groupEntries.every(isSavedEntry),
  }));
}

/** Groups identical removed bottles. */
export function groupExcludedBottles(exclusions: MenuBottleExclusion[]): ExcludedBottleGroup[] {
  return groupByKey(exclusions, (exclusion) => bottleGroupKey(exclusion.bottle)).map(([key, groupExclusions]) => ({
    key,
    bottle: groupExclusions[0].bottle,
    exclusions: groupExclusions,
    isEmpty: groupExclusions.every((exclusion) => isEmptyBottle(exclusion.bottle)),
  }));
}
