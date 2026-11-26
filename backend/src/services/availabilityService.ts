import { PrismaClient } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../errors';
import { parseTranslations, type StoredTranslations } from '../utils/translations';

/** A resource that allows this many servings or fewer is reported as running low. */
export const LOW_STOCK_THRESHOLD = 3;

/** Servings shown when no measured resource limits the cocktail (free ingredients, pieces only). */
export const UNLIMITED_SERVINGS = 999;

// Absorbs binary float error: 3 × 0.6 ml is 1.7999999999999998, not 1.8.
const FLOAT_TOLERANCE = 1e-9;

/** A name the frontend localizes: `nameTranslations` is null when the row has none (bottles never do). */
export interface LocalizedName {
  name: string;
  nameTranslations: StoredTranslations | null;
}

export interface IngredientAvailability extends LocalizedName {
  cocktailIngredientId: number;
  sourceType: string;
  /** The source is gone or unreadable: `name` is empty and the frontend shows a placeholder. */
  orphan: boolean;
  icon: string | null;
  quantity: number;
  unit: string;
  isAvailable: boolean;
  /** Servings this line's resource allows; null when unlimited or not measured. */
  availableCount: number | null;
  /** CATEGORY lines with preferred bottles only: at least one preferred bottle is not empty. */
  preferredAvailable?: boolean;
}

/** A resource that allows only a few servings; the frontend words the warning in the interface language. */
export interface LowStockResource extends LocalizedName {
  servings: number;
}

/** The lines to flag as missing are the `ingredients` whose `isAvailable` is false. */
export interface CocktailAvailability {
  cocktailId: number;
  isAvailable: boolean;
  maxServings: number;
  ingredients: IngredientAvailability[];
  lowStock: LowStockResource[];
}

/** One recipe line, as the calculation needs it (no Prisma type, so tests build it by hand). */
export interface RecipeLine {
  id: number;
  sourceType: string;
  quantity: number;
  unit: { abbreviation: string; conversionFactorToMl: number | null };
  bottleId: number | null;
  categoryId: number | null;
  ingredientId: number | null;
  preferredBottleIds: number[];
}

export interface StockBottle {
  id: number;
  name: string;
  categoryId: number;
  capacityMl: number;
  remainingPercent: number;
}

export interface StockCategory extends LocalizedName {
  id: number;
}

export interface StockIngredient extends LocalizedName {
  id: number;
  icon: string | null;
  isAvailable: boolean;
}

/** The whole stock, indexed by id, loaded once per calculation. */
export interface StockSnapshot {
  bottles: Map<number, StockBottle>;
  bottleIdsByCategory: Map<number, number[]>;
  categories: Map<number, StockCategory>;
  ingredients: Map<number, StockIngredient>;
}

/** The recipes of the requested cocktails, keyed by cocktail id, and the stock they draw from. */
export interface AvailabilityData {
  recipes: Map<number, RecipeLine[]>;
  stock: StockSnapshot;
}

export type AvailabilityDb = Pick<PrismaClient, 'bottle' | 'category' | 'ingredient' | 'cocktail'>;

/** A bottle or a category: the stock that every line naming it shares. */
interface VolumeResource extends LocalizedName {
  key: string;
  availableMl: number;
  /** At least one non-empty bottle: enough for a line whose unit has no ml equivalent. */
  hasStock: boolean;
}

/**
 * `orphan`: a known source type whose source is gone. Its key was set to NULL
 * when the source was deleted before v1.8.0 (the admin form shows "--" and
 * C-21 keeps the line), or it names a row that no longer exists.
 * `invalid`: an unknown source type.
 */
type LineResolution =
  | { kind: 'invalid' }
  | { kind: 'orphan' }
  | { kind: 'ingredient'; ingredient: StockIngredient }
  | { kind: 'volume'; resource: VolumeResource; requiredMl: number | null };

interface ResourceUsage {
  resource: VolumeResource;
  servings: number;
}

function isNotEmpty(bottle: StockBottle): boolean {
  return bottle.remainingPercent > 0;
}

function remainingMl(bottle: StockBottle): number {
  return (bottle.capacityMl * bottle.remainingPercent) / 100;
}

function bottleResource(bottle: StockBottle): VolumeResource {
  return {
    key: `bottle:${bottle.id}`,
    name: bottle.name,
    nameTranslations: null,
    availableMl: remainingMl(bottle),
    hasStock: isNotEmpty(bottle),
  };
}

function nonEmptyBottlesOf(categoryId: number, stock: StockSnapshot): StockBottle[] {
  const bottleIds = stock.bottleIdsByCategory.get(categoryId) ?? [];
  return bottleIds
    .map((bottleId) => stock.bottles.get(bottleId))
    .filter((bottle): bottle is StockBottle => bottle !== undefined && isNotEmpty(bottle));
}

// Every non-empty bottle of the category counts, preferred or not (decision of
// 2026-10-08). A bottle that a recipe also names on a BOTTLE line is counted in
// both resources: rare, and accepted to keep the calculation simple.
function categoryResource(category: StockCategory, stock: StockSnapshot): VolumeResource {
  const bottles = nonEmptyBottlesOf(category.id, stock);
  return {
    key: `category:${category.id}`,
    name: category.name,
    nameTranslations: category.nameTranslations,
    availableMl: bottles.reduce((sum, bottle) => sum + remainingMl(bottle), 0),
    hasStock: bottles.length > 0,
  };
}

/**
 * Volume one serving of the line takes, from the unit's own conversion factor.
 * Null when the unit has no ml equivalent (piece, gram, slice…): such a line
 * only needs the resource to have some stock.
 */
function requiredMlOf(line: RecipeLine): number | null {
  const factor = line.unit.conversionFactorToMl;
  if (factor === null || factor <= 0) return null;
  const requiredMl = line.quantity * factor;
  return requiredMl > 0 ? requiredMl : null;
}

function findSource<T>(rows: Map<number, T>, sourceId: number | null): T | undefined {
  return sourceId === null ? undefined : rows.get(sourceId);
}

function resolveLine(line: RecipeLine, stock: StockSnapshot): LineResolution {
  if (line.sourceType === 'INGREDIENT') {
    const ingredient = findSource(stock.ingredients, line.ingredientId);
    if (!ingredient) return { kind: 'orphan' };
    return { kind: 'ingredient', ingredient };
  }
  if (line.sourceType === 'BOTTLE') {
    const bottle = findSource(stock.bottles, line.bottleId);
    if (!bottle) return { kind: 'orphan' };
    return { kind: 'volume', resource: bottleResource(bottle), requiredMl: requiredMlOf(line) };
  }
  if (line.sourceType === 'CATEGORY') {
    const category = findSource(stock.categories, line.categoryId);
    if (!category) return { kind: 'orphan' };
    return {
      kind: 'volume',
      resource: categoryResource(category, stock),
      requiredMl: requiredMlOf(line),
    };
  }
  return { kind: 'invalid' };
}

/**
 * Servings each measured resource allows. The volumes of all the lines that
 * share a resource add up first: two 40 ml lines on a 100 ml bottle make one
 * serving, not two.
 */
function computeResourceUsages(resolutions: LineResolution[]): Map<string, ResourceUsage> {
  const requiredMlByResource = new Map<string, { resource: VolumeResource; requiredMl: number }>();
  for (const resolution of resolutions) {
    if (resolution.kind !== 'volume' || resolution.requiredMl === null) continue;
    const { resource, requiredMl } = resolution;
    const previousMl = requiredMlByResource.get(resource.key)?.requiredMl ?? 0;
    requiredMlByResource.set(resource.key, { resource, requiredMl: previousMl + requiredMl });
  }

  const usages = new Map<string, ResourceUsage>();
  for (const [key, { resource, requiredMl }] of requiredMlByResource) {
    const servings = Math.floor(resource.availableMl / requiredMl + FLOAT_TOLERANCE);
    usages.set(key, { resource, servings });
  }
  return usages;
}

function hasNonEmptyPreferredBottle(line: RecipeLine, stock: StockSnapshot): boolean {
  return line.preferredBottleIds.some((bottleId) => {
    const bottle = stock.bottles.get(bottleId);
    return bottle !== undefined && isNotEmpty(bottle);
  });
}

function describeLine(
  line: RecipeLine,
  resolution: LineResolution,
  usages: Map<string, ResourceUsage>,
): IngredientAvailability {
  const base: IngredientAvailability = {
    cocktailIngredientId: line.id,
    sourceType: line.sourceType,
    name: '',
    nameTranslations: null,
    orphan: false,
    icon: null,
    quantity: line.quantity,
    unit: line.unit.abbreviation,
    isAvailable: false,
    availableCount: null,
  };

  if (resolution.kind === 'invalid' || resolution.kind === 'orphan') {
    return { ...base, orphan: true };
  }

  if (resolution.kind === 'ingredient') {
    const { name, nameTranslations, icon, isAvailable } = resolution.ingredient;
    return {
      ...base,
      name,
      nameTranslations,
      icon,
      isAvailable,
      availableCount: isAvailable ? null : 0,
    };
  }

  const { resource } = resolution;
  const named = { name: resource.name, nameTranslations: resource.nameTranslations };
  const usage = usages.get(resource.key);
  // No line measures this resource: having some stock is enough
  if (!usage) {
    return {
      ...base,
      ...named,
      isAvailable: resource.hasStock,
      availableCount: resource.hasStock ? null : 0,
    };
  }
  return { ...base, ...named, isAvailable: usage.servings > 0, availableCount: usage.servings };
}

function lowStockResources(usages: Map<string, ResourceUsage>): LowStockResource[] {
  return [...usages.values()]
    .filter(({ servings }) => servings > 0 && servings <= LOW_STOCK_THRESHOLD)
    .map(({ resource, servings }) => ({
      name: resource.name,
      nameTranslations: resource.nameTranslations,
      servings,
    }));
}

/**
 * How many servings of a cocktail the stock allows. Pure: every input is
 * already loaded, so the same code serves one cocktail or all of them.
 */
export function computeAvailability(
  cocktailId: number,
  lines: RecipeLine[],
  stock: StockSnapshot,
): CocktailAvailability {
  const resolutions = lines.map((line) => resolveLine(line, stock));
  const usages = computeResourceUsages(resolutions);

  const ingredients = lines.map((line, index) => {
    const availability = describeLine(line, resolutions[index], usages);
    // Decision of 2026-10-08: preferred bottles never limit the servings, the
    // admin only gets a warning when none of them is left.
    if (line.sourceType === 'CATEGORY' && line.preferredBottleIds.length > 0) {
      availability.preferredAvailable = hasNonEmptyPreferredBottle(line, stock);
    }
    return availability;
  });

  // Decision of 2026-10-11: an orphan line stays unavailable and listed as
  // missing, so the admin still sees it, but it no longer makes the
  // cocktail unavailable: nothing is missing from the stock.
  const isAvailable = ingredients.every(
    (ingredient, index) => ingredient.isAvailable || resolutions[index].kind === 'orphan',
  );
  const resourceServings = [...usages.values()].map(({ servings }) => servings);
  const stockServings =
    resourceServings.length > 0 ? Math.min(...resourceServings) : UNLIMITED_SERVINGS;

  return {
    cocktailId,
    isAvailable,
    maxServings: isAvailable ? stockServings : 0,
    ingredients,
    lowStock: lowStockResources(usages),
  };
}

/** Indexes the loaded rows by id, and the bottles by category. */
export function buildStockSnapshot(
  bottles: StockBottle[],
  categories: StockCategory[],
  ingredients: StockIngredient[],
): StockSnapshot {
  const bottleIdsByCategory = new Map<number, number[]>();
  for (const bottle of bottles) {
    const categoryBottleIds = bottleIdsByCategory.get(bottle.categoryId) ?? [];
    categoryBottleIds.push(bottle.id);
    bottleIdsByCategory.set(bottle.categoryId, categoryBottleIds);
  }
  return {
    bottles: new Map(bottles.map((bottle) => [bottle.id, bottle])),
    bottleIdsByCategory,
    categories: new Map(categories.map((category) => [category.id, category])),
    ingredients: new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
  };
}

/**
 * Loads the stock and the recipes of the given cocktails (all of them when
 * `cocktailIds` is omitted) in a fixed number of queries, whatever the number
 * of cocktails.
 */
export async function loadStock(
  db: AvailabilityDb = prisma,
  cocktailIds?: number[],
): Promise<AvailabilityData> {
  const [bottles, categories, ingredients, cocktails] = await Promise.all([
    db.bottle.findMany({
      select: { id: true, name: true, categoryId: true, capacityMl: true, remainingPercent: true },
    }),
    db.category.findMany({ select: { id: true, name: true, nameTranslations: true } }),
    db.ingredient.findMany({
      select: { id: true, name: true, nameTranslations: true, icon: true, isAvailable: true },
    }),
    db.cocktail.findMany({
      where: cocktailIds === undefined ? {} : { id: { in: cocktailIds } },
      select: {
        id: true,
        ingredients: {
          select: {
            id: true,
            sourceType: true,
            quantity: true,
            bottleId: true,
            categoryId: true,
            ingredientId: true,
            unit: { select: { abbreviation: true, conversionFactorToMl: true } },
            preferredBottles: { select: { bottleId: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    }),
  ]);

  const recipes = new Map(
    cocktails.map((cocktail) => [
      cocktail.id,
      cocktail.ingredients.map(({ preferredBottles, ...line }) => ({
        ...line,
        preferredBottleIds: preferredBottles.map(({ bottleId }) => bottleId),
      })),
    ]),
  );
  const withParsedNames = <T extends { nameTranslations: string | null }>(row: T) => ({
    ...row,
    nameTranslations: parseTranslations(row.nameTranslations),
  });
  const stock = buildStockSnapshot(
    bottles,
    categories.map(withParsedNames),
    ingredients.map(withParsedNames),
  );
  return { recipes, stock };
}

/** Availability of the given cocktails (all of them when `cocktailIds` is omitted), keyed by cocktail id. */
export async function calculateAvailabilities(
  db: AvailabilityDb = prisma,
  cocktailIds?: number[],
): Promise<Map<number, CocktailAvailability>> {
  // A bottle menu (apéritifs, digestifs) has no cocktail: skip the stock load
  if (cocktailIds?.length === 0) return new Map();
  const { recipes, stock } = await loadStock(db, cocktailIds);
  const availabilities = new Map<number, CocktailAvailability>();
  for (const [cocktailId, lines] of recipes) {
    availabilities.set(cocktailId, computeAvailability(cocktailId, lines, stock));
  }
  return availabilities;
}

export async function calculateCocktailAvailability(
  cocktailId: number,
  db: AvailabilityDb = prisma,
): Promise<CocktailAvailability> {
  const availability = (await calculateAvailabilities(db, [cocktailId])).get(cocktailId);
  if (!availability) throw new NotFoundError();
  return availability;
}

export async function calculateAllCocktailsAvailability(
  db: AvailabilityDb = prisma,
): Promise<Record<number, CocktailAvailability>> {
  return Object.fromEntries(await calculateAvailabilities(db));
}
