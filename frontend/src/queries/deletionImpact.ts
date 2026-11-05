import type { TFunction } from 'i18next';
import { ApiError } from '../services/api';
import type { DeletionImpact } from '../types';

// Enough to recognise the items in a toast; a category may hold dozens of bottles.
const MAX_LISTED_NAMES = 5;

function isNamedList(value: unknown): value is { name: string }[] {
  return Array.isArray(value) && value.every((item) => typeof item?.name === 'string');
}

/** The impact of a deletion refused because the item is in use, or null for any other error. */
export function readDeletionImpact(error: unknown): DeletionImpact | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = (error.body as { details?: Partial<DeletionImpact> } | undefined)?.details;
  if (!isNamedList(details?.cocktails) || !isNamedList(details?.bottles)) return null;
  return details as DeletionImpact;
}

function listNames(t: TFunction, items: { name: string }[]): string {
  const listed = items.slice(0, MAX_LISTED_NAMES).map((item) => item.name).join(', ');
  const hidden = items.length - MAX_LISTED_NAMES;
  return hidden > 0 ? `${listed} ${t('deletion.more', { count: hidden })}` : listed;
}

/**
 * The error to show for a failed mutation. A deletion refused because the item
 * is in use keeps the backend message and names the cocktails and bottles that
 * use it, so the admin knows what to change first. `inUseHint`, already
 * translated, tells how to do it.
 */
export function describeMutationError(error: unknown, t: TFunction, inUseHint?: string): unknown {
  const impact = readDeletionImpact(error);
  if (!impact) return error;

  const parts = [(error as Error).message];
  if (impact.cocktails.length > 0) parts.push(t('deletion.usedByCocktails', { names: listNames(t, impact.cocktails) }));
  if (impact.bottles.length > 0) parts.push(t('deletion.usedByBottles', { names: listNames(t, impact.bottles) }));
  if (inUseHint) parts.push(inUseHint);
  return new Error(parts.join(' '));
}
