import type { z } from 'zod';
import type * as auth from '../validation/auth';
import type * as availability from '../validation/availability';
import type * as backup from '../validation/backup';
import type * as bottleImport from '../validation/bottleImport';
import type * as bottles from '../validation/bottles';
import type * as categories from '../validation/categories';
import type * as categoryTypes from '../validation/categoryTypes';
import type * as cocktailImport from '../validation/cocktailImport';
import type * as cocktails from '../validation/cocktails';
import type * as common from '../validation/common';
import type * as ingredients from '../validation/ingredients';
import type * as menuBottles from '../validation/menuBottles';
import type * as menus from '../validation/menus';
import type * as menuSections from '../validation/menuSections';
import type * as publicResponses from '../validation/public';
import type * as settings from '../validation/settings';
import type * as system from '../validation/system';
import type * as units from '../validation/units';

/*
 * What the frontend imports from frontend/src/types/generated.ts. `npm run contracts:generate`
 * writes that file from the exports below: each type alias becomes a plain TypeScript type,
 * as the compiler infers it, and each constant is copied as it is. A test fails while the
 * file is out of date.
 *
 * Responses are typed with `z.output`, request bodies with `z.input`: what the frontend
 * sends, before the schema trims or transforms it.
 */

export { SOURCE_KEYS, SOURCE_TYPES } from '../validation/cocktails';
export { MENU_TYPES } from '../validation/menus';

export type SourceType = z.output<typeof cocktails.SourceType>;
export type MenuType = z.output<typeof menus.MenuType>;
export type ImportMatchStatus = z.output<typeof common.ImportMatchStatus>;

// Responses

export type User = z.output<typeof auth.User>;
export type LoginResponse = z.output<typeof auth.LoginResponse>;
export type ProfileResponse = z.output<typeof settings.ProfileResponse>;
export type MessageResponse = z.output<typeof common.MessageResponse>;
export type Unit = z.output<typeof units.Unit>;
export type CategoryType = z.output<typeof categoryTypes.CategoryType>;
export type CategoryTypeListItem = z.output<typeof categoryTypes.CategoryTypeListItem>;
export type Category = z.output<typeof categories.Category>;
export type CategoryListItem = z.output<typeof categories.CategoryListItem>;
export type PublicCategory = z.output<typeof categories.PublicCategory>;
export type Shortage = z.output<typeof categories.Shortage>;
export type Ingredient = z.output<typeof ingredients.Ingredient>;
export type PublicIngredient = z.output<typeof ingredients.PublicIngredient>;
export type BulkAvailabilityResponse = z.output<typeof ingredients.BulkAvailabilityResponse>;
export type Bottle = z.output<typeof bottles.Bottle>;
export type CocktailRow = z.output<typeof cocktails.CocktailRow>;
export type CocktailPreferredBottle = z.output<typeof cocktails.CocktailPreferredBottle>;
export type CocktailIngredient = z.output<typeof cocktails.CocktailIngredient>;
export type CocktailInstruction = z.output<typeof cocktails.CocktailInstruction>;
export type Cocktail = z.output<typeof cocktails.Cocktail>;
export type IngredientAvailability = z.output<typeof availability.IngredientAvailability>;
export type LowStockResource = z.output<typeof availability.LowStockResource>;
export type CocktailAvailability = z.output<typeof availability.CocktailAvailability>;
export type CocktailAvailabilities = z.output<typeof availability.CocktailAvailabilities>;
export type MenuSection = z.output<typeof menuSections.MenuSection>;
export type MenuRow = z.output<typeof menus.MenuRow>;
export type MenuSummary = z.output<typeof menus.MenuSummary>;
export type MenuBottle = z.output<typeof menus.MenuBottle>;
export type MenuCocktailIngredient = z.output<typeof menus.MenuCocktailIngredient>;
export type MenuCocktail = z.output<typeof menus.MenuCocktail>;
export type MenuDetail = z.output<typeof menus.MenuDetail>;
export type UpdatedMenu = z.output<typeof menus.UpdatedMenu>;
export type MenuBottleExclusion = z.output<typeof menuBottles.MenuBottleExclusion>;
export type MenuSyncResponse = z.output<typeof menuBottles.MenuSyncResponse>;
export type PublicIngredientBottle = z.output<typeof publicResponses.PublicIngredientBottle>;
export type PublicCocktailIngredient = z.output<typeof publicResponses.PublicCocktailIngredient>;
export type PublicCocktail = z.output<typeof publicResponses.PublicCocktail>;
export type PublicMenuCocktail = z.output<typeof publicResponses.PublicMenuCocktail>;
export type PublicMenuBottle = z.output<typeof publicResponses.PublicMenuBottle>;
export type PublicMenu = z.output<typeof publicResponses.PublicMenu>;
export type SiteSettings = z.output<typeof settings.SiteSettings>;
export type SiteSettingsRow = z.output<typeof settings.SiteSettingsRow>;
export type DeletionImpact = z.output<typeof common.DeletionImpact>;
export type DeletionResponse = z.output<typeof common.DeletionResponse>;
export type ExportIngredient = z.output<typeof cocktailImport.ExportIngredient>;
export type CocktailExportFormat = z.output<typeof cocktailImport.CocktailExportFormat>;
export type CocktailExportFile = z.output<typeof cocktailImport.CocktailExportFile>;
export type ImportPreviewResponse = z.output<typeof cocktailImport.ImportPreviewResponse>;
export type BottleImportCategoryRecord = z.output<typeof bottleImport.BottleImportCategoryRecord>;
export type BottleImportRecord = z.output<typeof bottleImport.BottleImportRecord>;
export type BottleImportPayload = z.output<typeof bottleImport.BottleImportPreviewPayload>;
export type BottleImportRowErrorCode = z.output<typeof bottleImport.BottleImportRowErrorCode>;
export type BottleImportRowError = z.output<typeof bottleImport.BottleImportRowError>;
export type BottleImportRowWarning = z.output<typeof bottleImport.BottleImportRowWarning>;
export type BottleCategoryPreview = z.output<typeof bottleImport.BottleCategoryPreview>;
export type BottleDuplicateEntry = z.output<typeof bottleImport.BottleDuplicateEntry>;
export type BottleRowPreview = z.output<typeof bottleImport.BottleRowPreview>;
export type BottleImportPreviewResponse = z.output<typeof bottleImport.BottleImportPreviewResponse>;
export type BottleImportConfirmResponse = z.output<typeof bottleImport.BottleImportConfirmResponse>;
export type RequiredAction = z.output<typeof system.RequiredAction>;
export type UpgradeNotice = z.output<typeof system.UpgradeNotice>;
export type BackupRestoreResult = z.output<typeof backup.BackupRestoreResult>;

// Request bodies

export type CategoryTypeInput = z.input<typeof categoryTypes.CategoryTypeCreate>;
export type CategoryTypeUpdateInput = z.input<typeof categoryTypes.CategoryTypeUpdate>;
export type CategoryInput = z.input<typeof categories.CategoryCreate>;
export type CategoryUpdateInput = z.input<typeof categories.CategoryUpdate>;
export type IngredientInput = z.input<typeof ingredients.IngredientCreate>;
export type IngredientUpdateInput = z.input<typeof ingredients.IngredientUpdate>;
export type BulkAvailabilityInput = z.input<typeof ingredients.BulkAvailability>;
export type UnitInput = z.input<typeof units.UnitCreate>;
export type UnitUpdateInput = z.input<typeof units.UnitUpdate>;
export type CocktailIngredientInput = z.input<typeof cocktails.IngredientLine>;
export type CocktailInput = z.input<typeof cocktails.CocktailCreate>;
export type CocktailImportInput = z.input<typeof cocktailImport.ImportRecipeV1>;
export type BottleInput = z.input<typeof bottles.BottleCreate>;
export type BottleUpdateInput = z.input<typeof bottles.BottleUpdate>;
export type BottleCategoryResolutions = z.input<typeof bottleImport.BottleCategoryResolutions>;
export type BottleRowResolutions = z.input<typeof bottleImport.BottleRowResolutions>;
export type BottleImportConfirmInput = z.input<typeof bottleImport.BottleImportConfirm>;
export type MenuCreateInput = z.input<typeof menus.MenuCreate>;
export type MenuUpdateInput = z.input<typeof menus.MenuUpdate>;
export type MenuSectionInput = z.input<typeof menuSections.MenuSectionCreate>;
export type MenuSectionUpdateInput = z.input<typeof menuSections.MenuSectionUpdate>;
export type MenuBottleUpdateInput = z.input<typeof menuBottles.MenuBottleUpdate>;
export type MenuBottleGroupUpdateInput = z.input<typeof menuBottles.MenuBottleGroupUpdate>;
export type SiteSettingsInput = z.input<typeof settings.SiteSettingsUpdate>;
export type ProfileInput = z.input<typeof settings.ProfileUpdate>;
