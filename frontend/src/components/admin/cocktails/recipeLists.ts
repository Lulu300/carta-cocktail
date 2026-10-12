import type { Bottle, Category, Ingredient, Unit } from '../../../types';

/** Everything a recipe line can point to. */
export interface RecipeLists {
  categories: Category[];
  bottles: Bottle[];
  ingredients: Ingredient[];
  units: Unit[];
}

export function hasStock(bottle: Bottle): boolean {
  return bottle.remainingPercent > 0;
}
