import type {
  Bottle,
  Category,
  CategoryType,
  Cocktail,
  CocktailIngredient,
  CocktailAvailability,
  Ingredient,
  Menu,
  MenuBottle,
  MenuCocktail,
  MenuSection,
  Shortage,
  SiteSettings,
  Unit,
} from '../types';
import { CATEGORY_TYPE_COLORS } from '../utils/colors';

/**
 * Typed builders for API payloads. Each one returns a complete entity with
 * realistic defaults and takes partial overrides; ids grow per entity so two
 * built objects never share one. No type assertion here: when a type of
 * `types/index.ts` changes, this file stops compiling.
 */

const CREATED_AT = '2026-01-15T10:00:00.000Z';

type Entity =
  | 'bottle'
  | 'category'
  | 'categoryType'
  | 'cocktail'
  | 'cocktailIngredient'
  | 'ingredient'
  | 'menu'
  | 'menuBottle'
  | 'menuCocktail'
  | 'menuSection'
  | 'unit';

const counters = new Map<Entity, number>();

function nextId(entity: Entity): number {
  const id = (counters.get(entity) ?? 0) + 1;
  counters.set(entity, id);
  return id;
}

/** Restarts every id sequence: run after each test so ids do not depend on test order. */
export function resetFactories(): void {
  counters.clear();
}

/**
 * Realistic name for the n-th entity. Past the end of the pool the names
 * repeat with a number, so two built entities never share a name either.
 */
function nameFor(pool: readonly string[], id: number): string {
  const name = pool[(id - 1) % pool.length];
  return id > pool.length ? `${name} ${id}` : name;
}

const CATEGORY_TYPE_NAMES: readonly string[] = ['SPIRIT', 'SYRUP', 'SOFT', 'LIQUEUR'];
const CATEGORY_NAMES: readonly string[] = ['Gin', 'Vodka', 'Rhum blanc', 'Tequila', 'Whisky'];
const BOTTLE_NAMES: readonly string[] = ['Tanqueray', 'Absolut', 'Havana Club 3', 'Olmeca', 'Lagavulin 16'];
const INGREDIENT_NAMES: readonly string[] = ['Citron vert', 'Menthe', 'Sucre de canne', 'Glaçons', 'Orange'];
const COCKTAIL_NAMES: readonly string[] = ['Mojito', 'Negroni', 'Daiquiri', 'Margarita', 'Old Fashioned'];
const MENU_NAMES: readonly string[] = ['Carte d’été', 'Carte d’hiver', 'Soirée tiki'];
const SECTION_NAMES: readonly string[] = ['Classiques', 'Signatures', 'Sans alcool'];
const UNIT_DEFAULTS: readonly Omit<Unit, 'id'>[] = [
  { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
  { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 },
  { name: 'Trait', abbreviation: 'dash', conversionFactorToMl: 0.6 },
  { name: 'Feuille', abbreviation: 'feuille', conversionFactorToMl: null },
];
const UNIT_NAMES = UNIT_DEFAULTS.map((unit) => unit.name);

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildCategoryType(overrides: Partial<CategoryType> = {}): CategoryType {
  // The name is what identifies a category type: like an id, a given name uses up no number.
  const index = overrides.name === undefined ? nextId('categoryType') : 1;
  return {
    name: nameFor(CATEGORY_TYPE_NAMES, index),
    nameTranslations: null,
    color: CATEGORY_TYPE_COLORS[(index - 1) % CATEGORY_TYPE_COLORS.length],
    ...overrides,
  };
}

export function buildCategory(overrides: Partial<Category> = {}): Category {
  const id = overrides.id ?? nextId('category');
  return {
    name: nameFor(CATEGORY_NAMES, id),
    nameTranslations: null,
    type: 'SPIRIT',
    desiredStock: 1,
    minimumPercent: 30,
    createdAt: CREATED_AT,
    ...overrides,
    id,
  };
}

export function buildBottle(overrides: Partial<Bottle> = {}): Bottle {
  const id = overrides.id ?? nextId('bottle');
  return {
    name: nameFor(BOTTLE_NAMES, id),
    categoryId: overrides.category?.id ?? 1,
    purchasePrice: 25,
    capacityMl: 700,
    remainingPercent: 100,
    openedAt: null,
    alcoholPercentage: 40,
    location: null,
    isApero: false,
    isDigestif: false,
    createdAt: CREATED_AT,
    ...overrides,
    id,
  };
}

export function buildIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  const id = overrides.id ?? nextId('ingredient');
  return {
    name: nameFor(INGREDIENT_NAMES, id),
    nameTranslations: null,
    icon: null,
    isAvailable: true,
    createdAt: CREATED_AT,
    ...overrides,
    id,
  };
}

export function buildUnit(overrides: Partial<Unit> = {}): Unit {
  const id = overrides.id ?? nextId('unit');
  const unit = UNIT_DEFAULTS[(id - 1) % UNIT_DEFAULTS.length];
  return {
    name: nameFor(UNIT_NAMES, id),
    nameTranslations: null,
    abbreviation: unit.abbreviation,
    conversionFactorToMl: unit.conversionFactorToMl,
    ...overrides,
    id,
  };
}

/**
 * A line of a recipe, a free ingredient by default (2 of unit 1). Given an `id`,
 * the line and its ingredient share it unless `ingredient` says otherwise.
 */
export function buildCocktailIngredient(overrides: Partial<CocktailIngredient> = {}): CocktailIngredient {
  const id = overrides.id ?? nextId('cocktailIngredient');
  const ingredient = overrides.ingredient === undefined ? buildIngredient({ id }) : overrides.ingredient;
  return {
    cocktailId: 1,
    quantity: 2,
    unitId: 1,
    sourceType: 'INGREDIENT',
    bottleId: null,
    categoryId: null,
    ingredientId: ingredient?.id ?? null,
    ingredient,
    position: id,
    ...overrides,
    id,
  };
}

export function buildCocktail(overrides: Partial<Cocktail> = {}): Cocktail {
  const id = overrides.id ?? nextId('cocktail');
  return {
    name: nameFor(COCKTAIL_NAMES, id),
    description: null,
    notes: null,
    imagePath: null,
    tags: '',
    isAvailable: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ingredients: [],
    instructions: [],
    ...overrides,
    id,
  };
}

export function buildMenu(overrides: Partial<Menu> = {}): Menu {
  const id = overrides.id ?? nextId('menu');
  const name = overrides.name ?? nameFor(MENU_NAMES, id);
  return {
    name,
    description: null,
    slug: slugify(name),
    type: 'COCKTAILS',
    isPublic: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    sections: [],
    cocktails: [],
    bottles: [],
    ...overrides,
    id,
  };
}

export function buildMenuSection(overrides: Partial<MenuSection> = {}): MenuSection {
  const id = overrides.id ?? nextId('menuSection');
  return {
    menuId: 1,
    name: nameFor(SECTION_NAMES, id),
    position: id,
    ...overrides,
    id,
  };
}

/**
 * A cocktail of a menu. `cocktail` overrides are merged into a built cocktail,
 * so `buildMenuCocktail({ cocktail: { name: 'Negroni' } })` is enough. Given an
 * `id`, the entry and its cocktail share it unless `cocktail.id` says otherwise.
 */
export function buildMenuCocktail(
  overrides: Partial<Omit<MenuCocktail, 'cocktail'>> & { cocktail?: Partial<Cocktail> } = {},
): MenuCocktail {
  const { cocktail: cocktailOverrides, ...entryOverrides } = overrides;
  const id = entryOverrides.id ?? nextId('menuCocktail');
  const cocktail = buildCocktail({ id: entryOverrides.id ?? cocktailOverrides?.id, ...cocktailOverrides });
  return {
    menuId: 1,
    cocktailId: cocktail.id,
    cocktail,
    menuSectionId: null,
    position: id,
    isHidden: false,
    ...entryOverrides,
    id,
  };
}

/**
 * A bottle of a menu, an apéritif by default. `bottle` overrides are merged
 * into a built bottle, and the ids are shared, like in `buildMenuCocktail`.
 */
export function buildMenuBottle(
  overrides: Partial<Omit<MenuBottle, 'bottle'>> & { bottle?: Partial<Bottle> } = {},
): MenuBottle {
  const { bottle: bottleOverrides, ...entryOverrides } = overrides;
  const id = entryOverrides.id ?? nextId('menuBottle');
  const bottle = buildBottle({ id: entryOverrides.id ?? bottleOverrides?.id, isApero: true, ...bottleOverrides });
  return {
    menuId: 1,
    bottleId: bottle.id,
    bottle,
    menuSectionId: null,
    position: id,
    isHidden: false,
    ...entryOverrides,
    id,
  };
}

type ShortageCategory = Shortage['category'];

/**
 * A category under its desired stock, as listed by GET /api/shortages.
 * `category` overrides are merged into the default category.
 */
export function buildShortage(
  overrides: Partial<Omit<Shortage, 'category'>> & { category?: Partial<ShortageCategory> } = {},
): Shortage {
  const { category: categoryOverrides, ...shortageOverrides } = overrides;
  const { id, name, nameTranslations, type, desiredStock, minimumPercent } = buildCategory({ desiredStock: 2 });
  const category: ShortageCategory = {
    id,
    name,
    nameTranslations,
    type,
    categoryType: { name: type, color: 'blue' },
    desiredStock,
    minimumPercent,
    ...categoryOverrides,
  };
  return {
    category,
    totalPercent: 40,
    requiredPercent: 130,
    totalUsable: 1,
    isShortage: true,
    ...shortageOverrides,
  };
}

/** A cocktail that can be served, with no ingredient detail. */
export function buildAvailability(overrides: Partial<CocktailAvailability> = {}): CocktailAvailability {
  return {
    cocktailId: 1,
    isAvailable: true,
    maxServings: 4,
    ingredients: [],
    missingIngredients: [],
    lowStockWarnings: [],
    ...overrides,
  };
}

export function buildSiteSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return {
    id: 1,
    siteName: 'Carta',
    siteIcon: '🍸',
    ...overrides,
  };
}
