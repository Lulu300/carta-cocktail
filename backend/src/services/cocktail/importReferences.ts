import type { z } from 'zod';
import { ImportRecipeV1 } from '../../validation/cocktailImport';

type ImportedRecipe = z.output<typeof ImportRecipeV1>['cocktail'];
type Translations = Record<string, string | undefined> | null;

export type ImportedLine = NonNullable<ImportedRecipe['ingredients']>[number];

/** References and resolutions are keyed by lowercased name (or unit abbreviation). */
export function lowercase(value: string): string {
  return value.toLowerCase();
}

// What the preview sends back as `ref` for each entity: the fields the wizard
// shows and proposes when the admin chooses to create the entity.

export interface UnitRef {
  name?: string;
  abbreviation: string;
  conversionFactorToMl?: number | null;
  nameTranslations: Translations;
}

export interface CategoryRef {
  name: string;
  type: string;
  desiredStock: number;
  nameTranslations?: Translations;
}

export interface BottleRef {
  name: string;
  categoryName: string;
  categoryType: string;
}

export interface IngredientRef {
  name: string;
  icon: string | null;
  nameTranslations: Translations;
}

/** Entities a recipe refers to, keyed by lowercased unit abbreviation or name. */
export interface ImportReferences {
  units: Map<string, UnitRef>;
  categories: Map<string, CategoryRef>;
  bottles: Map<string, BottleRef>;
  ingredients: Map<string, IngredientRef>;
}

// A category named by a bottle; a category line of the recipe describes it better
function addBottleCategory(refs: ImportReferences, name: string, type: string, nameTranslations?: Translations): void {
  const key = lowercase(name);
  if (refs.categories.has(key)) return;
  refs.categories.set(key, { name, type, desiredStock: 1, ...(nameTranslations !== undefined && { nameTranslations }) });
}

function addSource(refs: ImportReferences, line: ImportedLine): void {
  const key = lowercase(line.sourceName);
  const detail = line.sourceDetail;
  if (line.sourceType === 'BOTTLE') {
    refs.bottles.set(key, {
      name: line.sourceName,
      categoryName: detail?.categoryName || '',
      categoryType: detail?.categoryType || 'SPIRIT',
    });
    if (detail?.categoryName) {
      addBottleCategory(refs, detail.categoryName, detail.categoryType || 'SPIRIT', detail.categoryNameTranslations || null);
    }
  } else if (line.sourceType === 'CATEGORY') {
    refs.categories.set(key, {
      name: line.sourceName,
      type: detail?.type || 'SPIRIT',
      desiredStock: detail?.desiredStock || 1,
      nameTranslations: detail?.nameTranslations || null,
    });
  } else {
    refs.ingredients.set(key, {
      name: line.sourceName,
      icon: detail?.icon || null,
      nameTranslations: detail?.nameTranslations || null,
    });
  }
}

// Only a CATEGORY line uses its preferred bottles: the others are not offered for creation
function addPreferredBottles(refs: ImportReferences, line: ImportedLine): void {
  if (line.sourceType !== 'CATEGORY') return;
  for (const bottle of line.preferredBottles ?? []) {
    refs.bottles.set(lowercase(bottle.name), {
      name: bottle.name,
      categoryName: bottle.categoryName || '',
      categoryType: 'SPIRIT',
    });
    if (bottle.categoryName) addBottleCategory(refs, bottle.categoryName, 'SPIRIT');
  }
}

/** Lists the units, categories, bottles and ingredients the recipe lines name. */
export function collectImportReferences(recipe: ImportedRecipe): ImportReferences {
  const refs: ImportReferences = { units: new Map(), categories: new Map(), bottles: new Map(), ingredients: new Map() };
  for (const line of recipe.ingredients ?? []) {
    if (line.unit) {
      refs.units.set(lowercase(line.unit.abbreviation), { ...line.unit, nameTranslations: line.unit.nameTranslations || null });
    }
    addSource(refs, line);
    addPreferredBottles(refs, line);
  }
  return refs;
}
