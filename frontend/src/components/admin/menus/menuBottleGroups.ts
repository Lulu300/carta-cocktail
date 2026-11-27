import type { Bottle, MenuBottle, MenuBottleExclusion } from '../../../types';
import { bottleGroupKey } from '../../../utils/bottleGrouping';

/** Identical bottles of one section of a menu, shown and changed as one row. */
export interface MenuBottleGroup {
  key: string;
  /** The first bottle of the group, for its name, category and strength. */
  bottle: Bottle;
  entries: MenuBottle[];
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

/** Identical bottles that are not in a personal menu yet, shown and added as one row. */
export interface BottleChoiceGroup {
  key: string;
  bottle: Bottle;
  bottles: Bottle[];
  isEmpty: boolean;
}

/** Entries not saved yet get a temporary negative id (see useMenuBottles). */
export function isSavedEntry(entry: MenuBottle): boolean {
  return entry.id > 0;
}

export function isEmptyBottle(bottle: Bottle): boolean {
  return bottle.remainingPercent === 0;
}

/** Groups the items by key, keeping the order of the first item of each group. */
function groupByKey<T>(items: T[], keyOf: (item: T) => string): [string, [T, ...T[]]][] {
  const groups = new Map<string, [T, ...T[]]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups];
}

/** Groups identical bottles of the same section. */
export function groupMenuBottles(entries: MenuBottle[]): MenuBottleGroup[] {
  const sectionAndBottle = (entry: MenuBottle) =>
    `${bottleGroupKey(entry.bottle)}|${entry.menuSectionId ?? ''}`;

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
  return groupByKey(exclusions, (exclusion) => bottleGroupKey(exclusion.bottle)).map(
    ([key, groupExclusions]) => ({
      key,
      bottle: groupExclusions[0].bottle,
      exclusions: groupExclusions,
      isEmpty: groupExclusions.every((exclusion) => isEmptyBottle(exclusion.bottle)),
    }),
  );
}

/** Groups identical bottles to add to a menu. */
export function groupBottleChoices(bottles: Bottle[]): BottleChoiceGroup[] {
  return groupByKey(bottles, bottleGroupKey).map(([key, groupBottles]) => ({
    key,
    bottle: groupBottles[0],
    bottles: groupBottles,
    isEmpty: groupBottles.every(isEmptyBottle),
  }));
}
