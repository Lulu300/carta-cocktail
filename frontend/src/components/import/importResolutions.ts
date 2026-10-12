import type { EntityResolutionAction, ImportEntityRef, ImportEntityResolution, ImportPreviewResponse } from '../../types';

/** The lists of entities a recipe refers to, in the order the wizard shows them. */
export const IMPORT_ENTITY_TYPES = ['units', 'categories', 'bottles', 'ingredients'] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

/** What the admin chose for each referenced entity, by type then by `resolutionKey`. */
export type ImportResolutions = Record<ImportEntityType, Record<string, EntityResolutionAction>>;

/** A field of the creation form the backend would refuse, or replace with the file's value. */
export type CreateDataField = 'name' | 'abbreviation' | 'capacityMl' | 'desiredStock';

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

/** Uses the entity the backend matched, and creates every other one with its default data. */
export function buildAutoResolutions(preview: ImportPreviewResponse): ImportResolutions {
  const resolutions = emptyResolutions();
  for (const type of IMPORT_ENTITY_TYPES) {
    for (const entity of preview[type]) {
      resolutions[type][resolutionKey(type, entity.ref)] = autoResolution(type, entity);
    }
  }
  return resolutions;
}

function isWholeNumber(value: number | null | undefined, min: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/** Fields of the creation data that block the import: blank names, missing or invalid numbers. */
export function invalidCreateFields(type: ImportEntityType, data: ImportEntityRef): CreateDataField[] {
  const invalid: CreateDataField[] = [];
  if (!data.name?.trim()) invalid.push('name');
  if (type === 'units' && !data.abbreviation?.trim()) invalid.push('abbreviation');
  if (type === 'bottles' && !isWholeNumber(data.capacityMl, 1)) invalid.push('capacityMl');
  if (type === 'categories' && !isWholeNumber(data.desiredStock, 0)) invalid.push('desiredStock');
  return invalid;
}

export function isResolutionComplete(type: ImportEntityType, resolution: EntityResolutionAction | undefined): boolean {
  switch (resolution?.action) {
    case 'use_existing':
      return resolution.existingId !== undefined;
    case 'create':
      return resolution.data !== undefined && invalidCreateFields(type, resolution.data).length === 0;
    case 'skip':
      return true;
    default:
      return false;
  }
}

/** Number of entities whose resolution cannot be sent as it is. */
export function countIncompleteResolutions(preview: ImportPreviewResponse, resolutions: ImportResolutions): number {
  let count = 0;
  for (const type of IMPORT_ENTITY_TYPES) {
    for (const entity of preview[type]) {
      if (!isResolutionComplete(type, resolutions[type][resolutionKey(type, entity.ref)])) count += 1;
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
