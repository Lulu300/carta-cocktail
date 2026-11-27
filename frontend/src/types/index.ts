// The types of the responses and request bodies that the backend's zod schemas describe are
// generated into generated.ts (`npm run contracts:generate` in backend/, task F-05). The
// interfaces below are the routes not covered yet: they move there route by route.
import type {
  Bottle,
  Category as StoredCategory,
  Cocktail,
  MenuSection,
  MenuType,
  SourceType,
} from './generated';

export { MENU_TYPES, SOURCE_KEYS, SOURCE_TYPES } from './generated';
export type {
  AdminSiteSettings,
  Bottle,
  BottleInput,
  BottleUpdateInput,
  Cocktail,
  CocktailIngredient,
  CocktailIngredientInput,
  CocktailInput,
  CocktailInstruction,
  CocktailPreferredBottle,
  CocktailRow,
  DeletionImpact,
  DeletionResponse,
  Ingredient,
  MenuCreateInput,
  MenuSection,
  MenuType,
  MenuUpdateInput,
  PublicCategory,
  PublicCocktail,
  PublicCocktailIngredient,
  PublicIngredient,
  PublicIngredientBottle,
  PublicMenu,
  PublicMenuBottle,
  PublicMenuCocktail,
  PublicMenuSummary,
  SiteSettings,
  SourceType,
  Unit,
} from './generated';

export interface User {
  id: number;
  email: string;
}

export interface CategoryType {
  name: string;
  nameTranslations?: Record<string, string> | null;
  color: string;
  _count?: { categories: number };
}

/** A category as the categories route sends it, with its type and its number of bottles. */
export interface Category extends StoredCategory {
  categoryType?: CategoryType | null;
  _count?: { bottles: number };
}

export interface MenuCocktail {
  id: number;
  menuId: number;
  cocktailId: number;
  cocktail?: Cocktail;
  menuSectionId: number | null;
  position: number;
  isHidden: boolean;
}

export interface MenuBottle {
  id: number;
  menuId: number;
  bottleId: number;
  bottle?: Bottle;
  menuSectionId: number | null;
  position: number;
  isHidden: boolean;
}

export interface Menu {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  type: MenuType;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  sections?: MenuSection[];
  cocktails?: MenuCocktail[];
  bottles?: MenuBottle[];
  _count?: { cocktails: number; bottles: number };
}

export interface Shortage {
  category: {
    id: number;
    name: string;
    nameTranslations?: Record<string, string> | null;
    type: string;
    categoryType?: CategoryType | null;
    desiredStock: number;
    minimumPercent: number;
  };
  totalPercent: number;
  requiredPercent: number;
  totalUsable: number;
  isShortage: boolean;
}

// Availability types
export interface IngredientAvailability {
  cocktailIngredientId: number;
  sourceType: SourceType;
  name: string;
  nameTranslations: Record<string, string> | null;
  /** The source is gone or unreadable: `name` is empty. */
  orphan: boolean;
  icon: string | null;
  quantity: number;
  unit: string;
  isAvailable: boolean;
  availableCount: number | null;
  /** CATEGORY lines with preferred bottles only: at least one preferred bottle is not empty. */
  preferredAvailable?: boolean;
}

// Export/Import types
export interface CocktailExportFormat {
  version: number;
  exportedAt: string;
  cocktail: {
    name: string;
    description: string | null;
    notes: string | null;
    tags: string[];
    ingredients: ExportIngredient[];
    instructions: { stepNumber: number; text: string }[];
  };
}

export interface ExportIngredient {
  sourceType: SourceType;
  sourceName: string;
  sourceDetail: Record<string, unknown>;
  quantity: number;
  unit: { name: string; abbreviation: string; conversionFactorToMl: number | null } | null;
  position: number;
  preferredBottles: { name: string; categoryName: string }[];
}

export interface ImportPreviewResponse {
  cocktail: {
    name: string;
    description: string | null;
    tags: string[];
    alreadyExists: boolean;
  };
  units: ImportEntityResolution[];
  categories: ImportEntityResolution[];
  bottles: ImportEntityResolution[];
  ingredients: ImportEntityResolution[];
}

export interface ImportEntityRef {
  name?: string;
  abbreviation?: string;
  conversionFactorToMl?: number | null;
  nameTranslations?: Record<string, string> | null;
  type?: string;
  // null while the admin has cleared the field in the wizard
  desiredStock?: number | null;
  categoryName?: string;
  capacityMl?: number | null;
  remainingPercent?: number;
  icon?: string | null;
}

/**
 * `ambiguous` (categories and units only): several existing rows equal the name ignoring case,
 * none exactly. `existingMatch` is null and `ambiguousMatches` lists them; the backend refuses to
 * create the entity (409), the admin uses one of them.
 */
export type ImportMatchStatus = 'matched' | 'missing' | 'ambiguous';

export interface ImportEntityResolution {
  ref: ImportEntityRef;
  existingMatch: { id: number; name: string } | null;
  status: ImportMatchStatus;
  ambiguousMatches?: { id: number; name: string }[];
}

export interface EntityResolutionAction {
  action: 'use_existing' | 'create' | 'skip';
  existingId?: number;
  data?: ImportEntityRef;
}

export interface CocktailAvailability {
  cocktailId: number;
  isAvailable: boolean;
  maxServings: number;
  ingredients: IngredientAvailability[];
  lowStock: LowStockResource[];
}

export interface LowStockResource {
  name: string;
  nameTranslations: Record<string, string> | null;
  servings: number;
}

// Bottle import/export types
export interface BottleImportCategoryRecord {
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: Record<string, string> | null;
}

export interface BottleImportRecord {
  name: string;
  categoryName: string;
  capacityMl: number;
  remainingPercent: number;
  alcoholPercentage: number | null;
  purchasePrice: number | null;
  location: string | null;
  openedAt: string | null;
  isApero: boolean;
  isDigestif: boolean;
  quantity: number;
}

export interface BottleImportPayload {
  version: number;
  categories: BottleImportCategoryRecord[];
  bottles: BottleImportRecord[];
}

export interface BottleCategoryPreview {
  ref: BottleImportCategoryRecord;
  existingMatch: { id: number; name: string; type: string; desiredStock: number } | null;
  status: ImportMatchStatus;
  ambiguousMatches?: { id: number; name: string; type: string; desiredStock: number }[];
}

export interface BottleDuplicateEntry {
  id: number;
  name: string;
  capacityMl: number;
  categoryName: string;
  remainingPercent: number;
}

export interface BottleRowPreview {
  ref: BottleImportRecord;
  needsCategory: boolean;
  potentialDuplicates: BottleDuplicateEntry[];
}

export type BottleImportRowErrorCode =
  'required' | 'outOfRange' | 'invalidDate' | 'invalidNumber' | 'malformedQuotes';

/**
 * A row of the file left out of the import. `line` is the CSV line (header = 1)
 * or the position in the JSON list (first = 1), within `source`. A CSV cell past the
 * last named column has an empty `field`, and its `column` number (first = 1).
 */
export interface BottleImportRowError {
  source: 'bottles' | 'categories';
  line: number;
  field: string;
  column?: number;
  code: BottleImportRowErrorCode;
}

/**
 * A value of a row the import keeps as it is, but that the admin should check, located like a
 * `BottleImportRowError`. `lineBreak`: a line break in a single-line text field.
 */
export interface BottleImportRowWarning {
  source: 'bottles' | 'categories';
  line: number;
  field: string;
  code: 'lineBreak';
}

export interface BottleImportPreviewResponse {
  payload: BottleImportPayload;
  categories: BottleCategoryPreview[];
  bottles: BottleRowPreview[];
  errors: BottleImportRowError[];
  // A backend older than this frontend sends none
  warnings?: BottleImportRowWarning[];
}

export type BottleCategoryResolution =
  // No id while the admin has not picked one of several matches yet
  | { action: 'use_existing'; existingId?: number }
  | {
      action: 'create';
      data: {
        name: string;
        type: string;
        desiredStock: number;
        minimumPercent: number;
        nameTranslations?: Record<string, string> | null;
      };
    };

export type BottleRowResolution =
  // `categoryId`: an existing category, which takes precedence over `categoryName`
  { action: 'import'; categoryId?: number; categoryName?: string } | { action: 'skip' };

export interface BottleImportResolutions {
  categories: Record<string, BottleCategoryResolution>;
  bottles: Record<string, BottleRowResolution>;
}

export interface BottleImportConfirmResponse {
  created: { bottles: number };
  duplicatesCreated: number;
  skippedNoCategory: number;
}

export interface DeleteOptions {
  /** Also deletes what uses the item: the recipe lines, and the bottles of a category. */
  force?: boolean;
}
