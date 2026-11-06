import { useBottles } from '../../queries/bottles';
import { useCategories } from '../../queries/categories';
import { useCategoryTypes } from '../../queries/categoryTypes';
import { useIngredients } from '../../queries/ingredients';
import { useUnits } from '../../queries/units';
import { qk } from '../../queries/keys';
import type { Bottle, Category, CategoryType, Ingredient, Unit } from '../../types';
import type { ImportEntityType } from './importResolutions';

/** Existing entities the admin can pick instead of creating one. */
export interface ImportReferenceLists {
  units: Unit[];
  categories: Category[];
  bottles: Bottle[];
  ingredients: Ingredient[];
  categoryTypes: CategoryType[];
  /** True when a list could not be loaded: its options are missing. */
  hasError: boolean;
}

/** Lists an import can create entries in: refreshed after a confirmation that created some. */
export const IMPORT_REFERENCE_KEYS = [qk.units, qk.categories, qk.bottles, qk.ingredients, qk.categoryTypes];

/**
 * Loads the lists once for the whole wizard. Called by the wizard rather than by
 * each step: the queries stay observed from one recipe of a batch to the next,
 * so a batch longer than the cache's stale time does not reload them per recipe.
 */
export function useImportReferenceLists(): ImportReferenceLists {
  const queries = {
    units: useUnits(),
    categories: useCategories(),
    bottles: useBottles(),
    ingredients: useIngredients(),
    categoryTypes: useCategoryTypes(),
  };
  return {
    units: queries.units.data ?? [],
    categories: queries.categories.data ?? [],
    bottles: queries.bottles.data ?? [],
    ingredients: queries.ingredients.data ?? [],
    categoryTypes: queries.categoryTypes.data ?? [],
    hasError: Object.values(queries).some((query) => query.isError),
  };
}

/** An existing entity the admin can map a referenced one to. */
export interface ExistingOption {
  id: number;
  name: string;
  abbreviation?: string;
  category?: { name?: string };
}

/** Label of an existing entity in the wizard: a unit shows its abbreviation too. */
export function existingOptionLabel(type: ImportEntityType, option: ExistingOption): string {
  return type === 'units' ? `${option.name} (${option.abbreviation})` : option.name;
}
