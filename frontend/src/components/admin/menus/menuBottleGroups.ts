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

/** Groups identical bottles, keeping the order of the first bottle of each group. */
export function groupMenuBottles(entries: MenuBottleEntry[]): MenuBottleGroup[] {
  const groups = new Map<string, MenuBottleEntry[]>();
  for (const entry of entries) {
    const key = `${bottleGroupKey(entry.bottle)}|${entry.menuSectionId ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups].map(([key, groupEntries]) => ({
    key,
    bottle: groupEntries[0].bottle,
    entries: groupEntries,
    menuSectionId: groupEntries[0].menuSectionId,
    isHidden: groupEntries.every((entry) => entry.isHidden),
    isEmpty: groupEntries.every((entry) => isEmptyBottle(entry.bottle)),
    isSaved: groupEntries.every(isSavedEntry),
  }));
}
