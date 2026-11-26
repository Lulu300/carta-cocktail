import type {
  BottleCategoryResolution,
  BottleImportCategoryRecord,
  BottleImportPreviewResponse,
  BottleImportResolutions,
  BottleRowResolution,
  Category,
  CategoryType,
} from '../../types';
import {
  DEFAULT_CATEGORY_TYPE,
  DEFAULT_DESIRED_STOCK,
  isMissingCategoryType,
  matchIgnoringCase,
  resolutionKey,
  type ExistingMatch,
} from './importResolutions';

// The backend gives this default to a category file that leaves it out
const DEFAULT_MINIMUM_PERCENT = 30;

/** Data of a category created by the import, from the file's values. */
export function defaultCategoryData(
  ref: BottleImportCategoryRecord,
): Extract<BottleCategoryResolution, { action: 'create' }>['data'] {
  return {
    name: ref.name,
    // `||`: the backend refuses a blank type
    type: ref.type || DEFAULT_CATEGORY_TYPE,
    desiredStock: ref.desiredStock ?? DEFAULT_DESIRED_STOCK,
    minimumPercent: ref.minimumPercent ?? DEFAULT_MINIMUM_PERCENT,
    nameTranslations: ref.nameTranslations ?? null,
  };
}

/**
 * Uses the category the backend matched, and creates every other one. A category several
 * existing ones match ignoring case gets nothing: the admin picks one of them.
 */
export function buildAutoCategoryResolutions(
  preview: BottleImportPreviewResponse,
): Record<string, BottleCategoryResolution> {
  const resolutions: Record<string, BottleCategoryResolution> = {};
  for (const entry of preview.categories) {
    if (entry.status === 'ambiguous') continue;
    resolutions[resolutionKey('categories', entry.ref)] =
      entry.status === 'matched' && entry.existingMatch
        ? { action: 'use_existing', existingId: entry.existingMatch.id }
        : { action: 'create', data: defaultCategoryData(entry.ref) };
  }
  return resolutions;
}

/** Every row is imported in the category of the file; rows are keyed by their index. */
export function buildAutoBottleResolutions(
  preview: BottleImportPreviewResponse,
): Record<string, BottleRowResolution> {
  const resolutions: Record<string, BottleRowResolution> = {};
  preview.bottles.forEach((entry, index) => {
    resolutions[String(index)] = { action: 'import', categoryName: entry.ref.categoryName };
  });
  return resolutions;
}

export function buildAutoBottleImportResolutions(
  preview: BottleImportPreviewResponse,
): BottleImportResolutions {
  return {
    categories: buildAutoCategoryResolutions(preview),
    bottles: buildAutoBottleResolutions(preview),
  };
}

/** The category name a row sends: the admin's choice, else the file's. */
function rowCategoryName(
  fileCategory: string,
  resolution: BottleRowResolution | undefined,
): string {
  return (resolution?.action === 'import' && resolution.categoryName) || fileCategory;
}

function importedRows(preview: BottleImportPreviewResponse, resolutions: BottleImportResolutions) {
  return preview.bottles.filter(
    (_, index) => resolutions.bottles[String(index)]?.action !== 'skip',
  );
}

/** Imported rows without a category: the confirmation would leave them out. */
export function countRowsWithoutCategory(
  preview: BottleImportPreviewResponse,
  resolutions: BottleImportResolutions,
): number {
  return preview.bottles.filter((entry, index) => {
    const resolution = resolutions.bottles[String(index)];
    if (resolution?.action === 'skip' || resolution?.categoryId !== undefined) return false;
    return !rowCategoryName(entry.ref.categoryName, resolution);
  }).length;
}

type CategoryCreation = Extract<BottleCategoryResolution, { action: 'create' }>;

/**
 * The name the backend gives a category to create: the trimmed name, or, when it is blank, the
 * file's, which the backend reads from the resolution key.
 */
function nameToCreate(key: string, resolution: CategoryCreation): string {
  return resolution.data.name.trim() || key;
}

/**
 * The existing category a category to create meets ignoring case (`matchIgnoringCase`): the
 * backend uses a category found as it is, and refuses an ambiguous name.
 */
export function existingCategoryFor(
  key: string,
  resolution: CategoryCreation,
  categories: Category[],
): ExistingMatch<Category> {
  return matchIgnoringCase(categories, nameToCreate(key, resolution), (category) => category.name);
}

/**
 * Categories the confirmation creates: one to create that a category holds ignoring case, existing
 * or created earlier in the import, uses that one.
 */
export function countCategoriesToCreate(
  resolutions: BottleImportResolutions,
  categories: Category[],
): number {
  return applyCategoryResolutions(categories, resolutions.categories).categories.filter(
    (category) => category.isNew,
  ).length;
}

/**
 * False while the confirmation would refuse the category (409): nothing chosen for a category
 * several existing ones match, none of them picked, or a name to create that several hold.
 */
function isCategoryResolved(
  key: string,
  resolution: BottleCategoryResolution | undefined,
  categories: Category[],
): boolean {
  if (!resolution) return false;
  if (resolution.action === 'use_existing') return resolution.existingId !== undefined;
  return existingCategoryFor(key, resolution, categories).status !== 'ambiguous';
}

/** Categories of the file still to resolve: they block the import. */
export function countCategoriesToResolve(
  preview: BottleImportPreviewResponse,
  resolutions: BottleImportResolutions,
  categories: Category[],
): number {
  return preview.categories.filter((entry) => {
    const key = resolutionKey('categories', entry.ref);
    return !isCategoryResolved(key, resolutions.categories[key], categories);
  }).length;
}

/** Categories to create under a type the backend refuses: the confirmation would answer 400. */
export function countCategoriesWithoutType(
  resolutions: BottleImportResolutions,
  categoryTypes: CategoryType[],
): number {
  return Object.values(resolutions.categories).filter(
    (resolution) =>
      resolution.action === 'create' && isMissingCategoryType(resolution.data.type, categoryTypes),
  ).length;
}

export function countDuplicateRows(
  preview: BottleImportPreviewResponse,
  resolutions: BottleImportResolutions,
): number {
  return importedRows(preview, resolutions).filter((entry) => entry.potentialDuplicates.length > 0)
    .length;
}

/** Bottles the confirmation creates: a row with a quantity creates several. */
export function countBottlesToCreate(
  preview: BottleImportPreviewResponse,
  resolutions: BottleImportResolutions,
): number {
  return importedRows(preview, resolutions).reduce(
    (total, entry) => total + (entry.ref.quantity || 1),
    0,
  );
}

/** What a row sends to go in a category: the id of an existing one, else a name the confirmation resolves to it. */
export type RowCategoryChoice = { categoryId: number } | { categoryName: string };

/** A category a row can go in: an existing one, or one the confirmation creates. */
export interface CategoryOption {
  name: string;
  isNew: boolean;
  choice: RowCategoryChoice;
}

export interface RowCategories {
  /** Every category a row can be put in. */
  options: CategoryOption[];
  /** The option of the category the confirmation puts a row in, if any. */
  categoryOf: (
    fileCategory: string,
    resolution: BottleRowResolution | undefined,
  ) => CategoryOption | undefined;
}

/**
 * The categories once the confirmation (`POST /bottles/import/confirm`) has applied the category
 * resolutions, in order: the existing ones then those it creates, and the category each resolution
 * key stands for. A category to create that a category already holds ignoring case, created
 * earlier in the import included, uses that one.
 */
function applyCategoryResolutions(
  existing: Category[],
  resolutions: Record<string, BottleCategoryResolution>,
) {
  const existingById = new Map(
    existing.map((category): [number, CategoryOption] => [
      category.id,
      { name: category.name, isNew: false, choice: { categoryId: category.id } },
    ]),
  );
  const categories: CategoryOption[] = [...existingById.values()];
  const resolvedByKey = new Map<string, CategoryOption>();

  for (const [key, resolution] of Object.entries(resolutions)) {
    let category: CategoryOption | undefined;
    if (resolution.action === 'use_existing') {
      category =
        resolution.existingId === undefined ? undefined : existingById.get(resolution.existingId);
    } else {
      const name = nameToCreate(key, resolution);
      const match = matchIgnoringCase(categories, name, (option) => option.name);
      if (match.status === 'found') category = match.row;
      if (match.status === 'none') {
        // By the key that creates it: its name can be another key of the file, resolved elsewhere
        category = { name, isNew: true, choice: { categoryName: key } };
        categories.push(category);
      }
      // An ambiguous name stays unresolved: the confirmation refuses it, and the wizard blocks it
    }
    if (category) resolvedByKey.set(key, category);
  }
  return { categories, existingById, resolvedByKey };
}

/**
 * The categories of the rows, by the rules of the confirmation: once the category resolutions are
 * applied (`applyCategoryResolutions`), it puts a row in the existing category of its id, else in
 * the category resolved for its name, else in the category that holds that name.
 *
 * Each option puts a row in its category whatever the other resolutions: an existing one by its
 * id, such as `Rhum` when the file's `rhum` is resolved to `RHUM` or renamed, one to create by the
 * key that creates it.
 */
export function rowCategories(
  existing: Category[],
  resolutions: Record<string, BottleCategoryResolution>,
): RowCategories {
  const { categories, existingById, resolvedByKey } = applyCategoryResolutions(
    existing,
    resolutions,
  );

  const categoryOfName = (categoryName: string) => {
    // The backend trims the name of a row
    const name = categoryName.trim();
    if (!name) return undefined;
    const resolved = resolvedByKey.get(resolutionKey('categories', { name }));
    if (resolved) return resolved;
    const match = matchIgnoringCase(categories, name, (option) => option.name);
    return match.status === 'found' ? match.row : undefined;
  };
  const categoryOf = (fileCategory: string, resolution: BottleRowResolution | undefined) => {
    if (resolution?.action === 'import' && resolution.categoryId !== undefined)
      return existingById.get(resolution.categoryId);
    return categoryOfName(rowCategoryName(fileCategory, resolution));
  };
  return { options: categories, categoryOf };
}
