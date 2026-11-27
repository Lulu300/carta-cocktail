import type { ImportMatchStatus } from './generated';

// What the import wizards read and edit before they confirm. Not generated: these are the
// wizards' own view of the contracts, whatever the kind of entity, and their editing state,
// narrower or looser than what the backend accepts (`ImportConfirm` and `BottleImportConfirm`
// in backend/src/validation/). Each entity of `ImportPreviewResponse` is an
// `ImportEntityResolution`, and the bottle wizard's state stays assignable to its contract:
// `bottles.importConfirm` takes the generated `BottleImportConfirmInput`.

/** What the cocktail wizard reads of an entity the recipe names, whatever its kind. */
export interface ImportEntityResolution {
  ref: ImportEntityRef;
  existingMatch: { id: number; name: string } | null;
  status: ImportMatchStatus;
  ambiguousMatches?: { id: number; name: string }[];
}

/**
 * A reference of the cocktail preview, or the data the admin edits to create it: the fields of
 * every kind, each one optional. A number the admin cleared is null; the wizard sends a creation
 * only once its numbers are valid (`invalidCreateFields`).
 */
export interface ImportEntityRef {
  name?: string;
  abbreviation?: string;
  conversionFactorToMl?: number | null;
  nameTranslations?: Record<string, string> | null;
  type?: string;
  desiredStock?: number | null;
  categoryName?: string;
  capacityMl?: number | null;
  remainingPercent?: number;
  icon?: string | null;
}

export interface EntityResolutionAction {
  action: 'use_existing' | 'create' | 'skip';
  existingId?: number;
  data?: ImportEntityRef;
}

/** A category of the bottle file: the existing one picked, or the data of the one to create. */
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
