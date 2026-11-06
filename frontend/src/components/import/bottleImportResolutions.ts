import type {
  BottleCategoryResolution,
  BottleImportCategoryRecord,
  BottleImportPreviewResponse,
  BottleImportResolutions,
  BottleRowResolution,
  Category,
} from '../../types';
import { DEFAULT_CATEGORY_TYPE, DEFAULT_DESIRED_STOCK, resolutionKey } from './importResolutions';

// The backend gives this default to a category file that leaves it out
const DEFAULT_MINIMUM_PERCENT = 30;

/** Data of a category created by the import, from the file's values. */
export function defaultCategoryData(ref: BottleImportCategoryRecord): Extract<BottleCategoryResolution, { action: 'create' }>['data'] {
  return {
    name: ref.name,
    // `||`: the backend refuses a blank type
    type: ref.type || DEFAULT_CATEGORY_TYPE,
    desiredStock: ref.desiredStock ?? DEFAULT_DESIRED_STOCK,
    minimumPercent: ref.minimumPercent ?? DEFAULT_MINIMUM_PERCENT,
    nameTranslations: ref.nameTranslations ?? null,
  };
}

/** Uses the category the backend matched, and creates every other one. */
export function buildAutoCategoryResolutions(preview: BottleImportPreviewResponse): Record<string, BottleCategoryResolution> {
  const resolutions: Record<string, BottleCategoryResolution> = {};
  for (const entry of preview.categories) {
    resolutions[resolutionKey('categories', entry.ref)] = entry.status === 'matched' && entry.existingMatch
      ? { action: 'use_existing', existingId: entry.existingMatch.id }
      : { action: 'create', data: defaultCategoryData(entry.ref) };
  }
  return resolutions;
}

/** Every row is imported in the category of the file; rows are keyed by their index. */
export function buildAutoBottleResolutions(preview: BottleImportPreviewResponse): Record<string, BottleRowResolution> {
  const resolutions: Record<string, BottleRowResolution> = {};
  preview.bottles.forEach((entry, index) => {
    resolutions[String(index)] = { action: 'import', categoryName: entry.ref.categoryName };
  });
  return resolutions;
}

export function buildAutoBottleImportResolutions(preview: BottleImportPreviewResponse): BottleImportResolutions {
  return { categories: buildAutoCategoryResolutions(preview), bottles: buildAutoBottleResolutions(preview) };
}

/** The category a row will be imported in: the admin's choice, else the file's. */
export function rowCategory(fileCategory: string, resolution: BottleRowResolution | undefined): string {
  return (resolution?.action === 'import' && resolution.categoryName) || fileCategory;
}

function importedRows(preview: BottleImportPreviewResponse, resolutions: BottleImportResolutions) {
  return preview.bottles.filter((_, index) => resolutions.bottles[String(index)]?.action !== 'skip');
}

/** Imported rows without a category: the confirmation would leave them out. */
export function countRowsWithoutCategory(preview: BottleImportPreviewResponse, resolutions: BottleImportResolutions): number {
  return preview.bottles.filter((entry, index) => {
    const resolution = resolutions.bottles[String(index)];
    return resolution?.action !== 'skip' && !rowCategory(entry.ref.categoryName, resolution);
  }).length;
}

export function countDuplicateRows(preview: BottleImportPreviewResponse, resolutions: BottleImportResolutions): number {
  return importedRows(preview, resolutions).filter((entry) => entry.potentialDuplicates.length > 0).length;
}

/** Bottles the confirmation creates: a row with a quantity creates several. */
export function countBottlesToCreate(preview: BottleImportPreviewResponse, resolutions: BottleImportResolutions): number {
  return importedRows(preview, resolutions).reduce((total, entry) => total + (entry.ref.quantity || 1), 0);
}

export interface CategoryOption {
  name: string;
  isNew: boolean;
}

/** Categories a row can be put in: the existing ones and those the import creates. */
export function categoryOptions(
  existing: Category[],
  preview: BottleImportPreviewResponse,
  resolutions: BottleImportResolutions,
): CategoryOption[] {
  const created = preview.categories.filter(
    (entry) => resolutions.categories[resolutionKey('categories', entry.ref)]?.action === 'create',
  );
  return [
    ...existing.map((category) => ({ name: category.name, isNew: false })),
    ...created.map((entry) => ({ name: entry.ref.name, isNew: true })),
  ];
}
