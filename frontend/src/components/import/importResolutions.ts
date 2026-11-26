import type {
  Category,
  CategoryType,
  EntityResolutionAction,
  ImportEntityRef,
  ImportEntityResolution,
  ImportPreviewResponse,
  Unit,
} from '../../types';
import { caseInsensitiveKey, tidyName } from '../../utils/invisibleCharacters';

/** The lists of entities a recipe refers to, in the order the wizard shows them. */
export const IMPORT_ENTITY_TYPES = ['units', 'categories', 'bottles', 'ingredients'] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

/** What the admin chose for each referenced entity, by type then by `resolutionKey`. */
export type ImportResolutions = Record<ImportEntityType, Record<string, EntityResolutionAction>>;

/** A field of the creation form the backend would refuse, or replace with the file's value. */
export type CreateDataField = 'name' | 'abbreviation' | 'type' | 'capacityMl' | 'desiredStock';

// A recipe never gives the capacity of a bottle: a standard 70 cl bottle is assumed.
const DEFAULT_BOTTLE_CAPACITY_ML = 700;
const DEFAULT_REMAINING_PERCENT = 100;
// Shared with the bottle import, which gives a category file the same defaults
export const DEFAULT_CATEGORY_TYPE = 'SPIRIT';
// Files exported since C-09 no longer carry `desiredStock`; the backend uses the same fallback.
export const DEFAULT_DESIRED_STOCK = 1;

/**
 * Key of an entity in the resolutions, as the backend reads it: the lowercased
 * abbreviation of a unit, the lowercased name of anything else.
 */
export function resolutionKey(type: ImportEntityType, ref: Pick<ImportEntityRef, 'name' | 'abbreviation'>): string {
  // `||`: a blank abbreviation falls back on the unit name
  const label = type === 'units' ? ref.abbreviation || ref.name : ref.name;
  return label?.toLowerCase() ?? '';
}

/**
 * How the wizard names a referenced entity. A unit shows its abbreviation too;
 * a hand-made file may give a unit without a name.
 */
export function referenceLabel(type: ImportEntityType, ref: Pick<ImportEntityRef, 'name' | 'abbreviation'>): string {
  if (type !== 'units') return ref.name ?? '';
  if (ref.name && ref.abbreviation) return `${ref.name} (${ref.abbreviation})`;
  return ref.name || ref.abbreviation || '';
}

export function emptyResolutions(): ImportResolutions {
  return { units: {}, categories: {}, bottles: {}, ingredients: {} };
}

/**
 * Data of an entity created by the import. Each type lists only the fields of
 * the backend's import schema (`backend/src/validation/cocktailImport.ts`).
 */
export function defaultCreateData(type: ImportEntityType, ref: ImportEntityRef): ImportEntityRef {
  const name = ref.name ?? '';
  const nameTranslations = ref.nameTranslations ?? null;
  switch (type) {
    case 'units':
      return {
        // The backend names a unit without a name after its abbreviation
        name: ref.name || ref.abbreviation || '',
        abbreviation: ref.abbreviation ?? '',
        conversionFactorToMl: ref.conversionFactorToMl ?? null,
        nameTranslations,
      };
    case 'categories':
      return {
        name,
        // `||`: the backend refuses a blank type
        type: ref.type || DEFAULT_CATEGORY_TYPE,
        desiredStock: ref.desiredStock ?? DEFAULT_DESIRED_STOCK,
        nameTranslations,
      };
    case 'bottles':
      return {
        name,
        categoryName: ref.categoryName ?? '',
        capacityMl: DEFAULT_BOTTLE_CAPACITY_ML,
        remainingPercent: DEFAULT_REMAINING_PERCENT,
      };
    case 'ingredients':
      return { name, icon: ref.icon ?? null, nameTranslations };
  }
}

function autoResolution(type: ImportEntityType, entity: ImportEntityResolution): EntityResolutionAction {
  if (entity.status === 'matched' && entity.existingMatch) {
    return { action: 'use_existing', existingId: entity.existingMatch.id };
  }
  return { action: 'create', data: defaultCreateData(type, entity.ref) };
}

/**
 * Uses the entity the backend matched, and creates every other one with its default data.
 * An ambiguous entity gets nothing: picking one of its matches would be a guess, and the
 * backend refuses to create it, so the admin chooses.
 */
export function buildAutoResolutions(preview: ImportPreviewResponse): ImportResolutions {
  const resolutions = emptyResolutions();
  for (const type of IMPORT_ENTITY_TYPES) {
    for (const entity of preview[type]) {
      if (entity.status === 'ambiguous') continue;
      resolutions[type][resolutionKey(type, entity.ref)] = autoResolution(type, entity);
    }
  }
  return resolutions;
}

/** How a value compares with the existing rows: one row found, none, or several equal ignoring case. */
export type ExistingMatch<Row> =
  | { status: 'none' }
  | { status: 'found'; row: Row }
  | { status: 'ambiguous'; rows: Row[] };

/**
 * The existing row the backend uses for a category name or a unit abbreviation it is asked to
 * create, by its rule (`CaseInsensitiveIndex.match`, `backend/src/utils/uniqueness.ts`): the row with
 * the exact value, else the only one equal ignoring case and Unicode form (`caseInsensitiveKey`, the
 * backend's key). Several rows equal ignoring case and none exactly is ambiguous: the backend refuses
 * to create it (409). The preview applies this rule to the file's values only, while the admin may
 * type another one.
 */
export function matchIgnoringCase<Row>(rows: Row[], value: string, valueOf: (row: Row) => string): ExistingMatch<Row> {
  const key = caseInsensitiveKey(value);
  const candidates = rows.filter((row) => caseInsensitiveKey(valueOf(row)) === key);
  const exact = candidates.find((row) => valueOf(row) === value);
  if (exact) return { status: 'found', row: exact };
  const [first] = candidates;
  if (first === undefined) return { status: 'none' };
  return candidates.length === 1 ? { status: 'found', row: first } : { status: 'ambiguous', rows: candidates };
}

/** Existing rows the creation data is checked against. */
export interface ExistingRows {
  categoryTypes: CategoryType[];
  categories: Pick<Category, 'id' | 'name'>[];
  units: Pick<Unit, 'id' | 'name' | 'abbreviation'>[];
}

/** A category or unit row the creation data may meet. */
export type UniqueRow = ExistingRows['categories'][number] | ExistingRows['units'][number];

/** The field a category or a unit is unique by, ignoring case. */
export const UNIQUE_FIELD: Partial<Record<ImportEntityType, 'name' | 'abbreviation'>> = { categories: 'name', units: 'abbreviation' };

/**
 * The existing row a category or unit to create meets, by name or by abbreviation: the backend
 * uses a row found as it is, and refuses an ambiguous value. Bottles and ingredients are always
 * created, their names need not be unique.
 *
 * Limit: only the existing rows count. Two entries of one import created under names equal
 * ignoring case meet nothing here, while the backend creates the first and uses it for the
 * second (`findOrCreate`): neither shows the "used as it is" hint, and the recipe import summary
 * lists both as created. The bottle import replays that order to count its creations
 * (`countCategoriesToCreate`).
 */
export function existingRowFor(type: ImportEntityType, data: ImportEntityRef, existing: ExistingRows): ExistingMatch<UniqueRow> {
  // The backend trims these values
  if (type === 'categories') return matchIgnoringCase(existing.categories, data.name?.trim() ?? '', (row) => row.name);
  if (type === 'units') return matchIgnoringCase(existing.units, data.abbreviation?.trim() ?? '', (row) => row.abbreviation);
  return { status: 'none' };
}

/**
 * True when the backend refuses to create a category under this type, as the category form does:
 * the empty name data older than v1.9.0 can hold, or a new type made only of blanks or invisible
 * characters. An existing type is kept exactly as picked, so an old type of spaces is accepted.
 */
export function isMissingCategoryType(type: string, categoryTypes: CategoryType[]): boolean {
  if (type === '') return true;
  const isExistingType = categoryTypes.some((categoryType) => categoryType.name === type);
  return !isExistingType && tidyName(type) === '';
}

function isWholeNumber(value: number | null | undefined, min: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/**
 * Fields of the creation data that block the import: blank names, a category name or a unit
 * abbreviation several existing rows hold ignoring case, a category type the backend refuses,
 * missing or invalid numbers. Existing category types are kept as picked.
 */
export function invalidCreateFields(type: ImportEntityType, data: ImportEntityRef, existing: ExistingRows): CreateDataField[] {
  const invalid: CreateDataField[] = [];
  if (!data.name?.trim()) invalid.push('name');
  if (type === 'units' && !data.abbreviation?.trim()) invalid.push('abbreviation');
  const uniqueField = UNIQUE_FIELD[type];
  if (uniqueField && existingRowFor(type, data, existing).status === 'ambiguous') invalid.push(uniqueField);
  // The backend gives its default type to a category sent without one
  if (type === 'categories' && isMissingCategoryType(data.type ?? DEFAULT_CATEGORY_TYPE, existing.categoryTypes)) invalid.push('type');
  if (type === 'bottles' && !isWholeNumber(data.capacityMl, 1)) invalid.push('capacityMl');
  if (type === 'categories' && !isWholeNumber(data.desiredStock, 0)) invalid.push('desiredStock');
  return invalid;
}

export function isResolutionComplete(
  type: ImportEntityType,
  resolution: EntityResolutionAction | undefined,
  existing: ExistingRows,
): boolean {
  switch (resolution?.action) {
    case 'use_existing':
      return resolution.existingId !== undefined;
    case 'create':
      return resolution.data !== undefined && invalidCreateFields(type, resolution.data, existing).length === 0;
    case 'skip':
      return true;
    default:
      return false;
  }
}

/** Number of entities whose resolution cannot be sent as it is. */
export function countIncompleteResolutions(
  preview: ImportPreviewResponse,
  resolutions: ImportResolutions,
  existing: ExistingRows,
): number {
  let count = 0;
  for (const type of IMPORT_ENTITY_TYPES) {
    for (const entity of preview[type]) {
      if (!isResolutionComplete(type, resolutions[type][resolutionKey(type, entity.ref)], existing)) count += 1;
    }
  }
  return count;
}

/** True when confirming creates at least one entity, so the cached lists become stale. */
export function createsEntities(resolutions: ImportResolutions): boolean {
  return IMPORT_ENTITY_TYPES.some((type) =>
    Object.values(resolutions[type]).some((resolution) => resolution.action === 'create'),
  );
}

/**
 * A number typed in a field: null when the field is empty or not a number, so
 * the form shows a validation message instead of sending `NaN`.
 */
export function parseNumberInput(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
