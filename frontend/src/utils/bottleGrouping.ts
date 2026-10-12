import type { Bottle, Category } from '../types';

/** Identical bottles (same product) shown as one row with a count. */
export interface BottleGroup<B extends Bottle = Bottle> {
  key: string;
  name: string;
  capacityMl: number;
  categoryId: number;
  alcoholPercentage: number | null;
  category?: Category;
  bottles: B[];
}

type GroupableBottle = Pick<Bottle, 'name' | 'capacityMl' | 'categoryId' | 'alcoholPercentage'>;

/**
 * Two bottles are the same product when they share name (whatever the case),
 * capacity, category and strength: only their stock level and location differ.
 */
export function bottleGroupKey(bottle: GroupableBottle): string {
  return `${bottle.name.toLowerCase()}|${bottle.capacityMl}|${bottle.categoryId}|${bottle.alcoholPercentage ?? ''}`;
}

/**
 * Groups identical bottles, keeping the order of the first bottle of each group.
 * A product with a single bottle stays a plain bottle.
 */
export function groupBottles<B extends Bottle>(bottles: B[]): (B | BottleGroup<B>)[] {
  const groups = new Map<string, BottleGroup<B>>();

  for (const bottle of bottles) {
    const key = bottleGroupKey(bottle);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: bottle.name,
        capacityMl: bottle.capacityMl,
        categoryId: bottle.categoryId,
        alcoholPercentage: bottle.alcoholPercentage,
        category: bottle.category,
        bottles: [],
      };
      groups.set(key, group);
    }
    group.bottles.push(bottle);
  }

  return [...groups.values()].map((group) => (group.bottles.length === 1 ? group.bottles[0] : group));
}

export function isGroup<B extends Bottle>(item: B | BottleGroup<B>): item is BottleGroup<B> {
  return 'bottles' in item && Array.isArray(item.bottles);
}
