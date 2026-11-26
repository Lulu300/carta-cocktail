import i18n from '../i18n';
import { ApiError, type UnknownReference, type UnresolvedReference } from '../services/api';
import { describeValidationIssue } from './validationMessage';

// Keys of a recipe line that name another row, and what an import may leave unresolved.
// A newer backend may send others: those entries are not named, the backend's message stays.
export const REFERENCE_FIELDS: readonly string[] = ['unitId', 'bottleId', 'categoryId', 'ingredientId', 'preferredBottleIds'];
export const UNRESOLVED_KINDS: readonly string[] = ['unit', 'category', 'bottle', 'ingredient'];

/** "Row 3, Ingredient: this item no longer exists…", or null when the field is unknown. */
export function describeUnknownReference({ line, field }: UnknownReference): string | null {
  if (!REFERENCE_FIELDS.includes(field)) return null;
  return i18n.t('validation.unknownReference', { row: line + 1, field: i18n.t(`validation.fields.${field}`) });
}

/** "Row 2: unit "cl" is neither matched nor created", or null when the kind is unknown. */
export function describeUnresolvedReference({ line, kind, name }: UnresolvedReference): string | null {
  if (!UNRESOLVED_KINDS.includes(kind)) return null;
  const row = line + 1;
  // Only a unit can be missing without a name: the line has no unit at all
  if (name === null) return kind === 'unit' ? i18n.t('validation.unresolved.noUnit', { row }) : null;
  return i18n.t(`validation.unresolved.${kind}`, { row, name });
}

function isDescribed(message: string | null): message is string {
  return message !== null;
}

/**
 * Each detail of a refused request the admin can act on, one sentence each: the inputs a
 * validation 400 refused, the lines an import could not resolve, the rows that no longer exist.
 * Empty for any other error, or when no detail can be named: the backend's message stays alone.
 * Each sentence comes once: two deleted preferred bottles of a row read the same.
 */
export function refusalDetails(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const described = [
    ...error.validationIssues().map(describeValidationIssue),
    ...error.unresolvedReferences().map(describeUnresolvedReference),
    ...error.unknownReferences().map(describeUnknownReference),
  ].filter(isDescribed);
  return [...new Set(described)];
}

/**
 * The message of a refused request in a toast: its first detail. The admin fixes it and saves
 * again; the next one, if any, shows then. Null keeps the backend's message.
 */
export function refusalMessage(error: unknown): string | null {
  return refusalDetails(error)[0] ?? null;
}
