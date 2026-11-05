import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { QueryKey } from '@tanstack/react-query';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useInvalidateQueries } from '../../queries/crud';
import { describeMutationError, readDeletionImpact } from '../../queries/deletionImpact';
import { qk } from '../../queries/keys';
import type { DeleteOptions, DeletionImpact, DeletionResponse } from '../../types';
import { toast } from '../ui/ToastStore';
import DeletionImpactList from './DeletionImpactList';

interface ForcedDeleteOptions {
  /** The `delete` method of the resource in `services/api.ts`. */
  deleteItem: (id: number, options: DeleteOptions) => Promise<DeletionResponse>;
  /** Queries of the page, refreshed after any deletion. */
  invalidates: QueryKey[];
  /** i18n key of the success toast. */
  deletedMessage: string;
}

// A forced deletion removes recipe lines, and a category its bottles: whatever
// shows a recipe, its availability or the stock is out of date.
const FORCED_DELETION_KEYS = [qk.cocktails, qk.availability, qk.shortages, qk.bottles, qk.categories, qk.menus];

/** "Category deleted", and after a forced deletion "Category deleted: 2 bottles deleted, 3 cocktails changed." */
function describeDeletion(t: TFunction, deletedMessage: string, { cocktails, bottles }: DeletionImpact): string {
  const changes: string[] = [];
  if (bottles.length > 0) changes.push(t('deletion.forced.bottlesDeleted', { count: bottles.length }));
  if (cocktails.length > 0) changes.push(t('deletion.forced.cocktailsChanged', { count: cocktails.length }));
  if (changes.length === 0) return t(deletedMessage);
  return t('deletion.forced.summary', { deleted: t(deletedMessage), changes: changes.join(', ') });
}

function forcedDeletionWarning(t: TFunction, { cocktails, bottles }: DeletionImpact): string {
  const parts: string[] = [];
  if (cocktails.length > 0) parts.push(t('deletion.forced.recipesWarning'));
  if (bottles.length > 0) parts.push(t('deletion.forced.bottlesWarning'));
  parts.push(t('deletion.forced.final'));
  return parts.join(' ');
}

/**
 * Deletes an item. When the backend refuses because recipes or bottles use it,
 * lists them and offers to delete anyway, once the admin has ticked that they
 * accept the changes. Cancelling deletes nothing and keeps the list in a toast,
 * so the admin can fix the recipes first.
 */
export function useForcedDelete({ deleteItem, invalidates, deletedMessage }: ForcedDeleteOptions): (id: number) => Promise<void> {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const invalidateQueries = useInvalidateQueries();

  const confirmForcedDeletion = (impact: DeletionImpact) => confirm({
    title: t('deletion.forced.title'),
    message: forcedDeletionWarning(t, impact),
    details: <DeletionImpactList impact={impact} />,
    acknowledgeLabel: t(impact.cocktails.length > 0 ? 'deletion.forced.acknowledgeRecipes' : 'deletion.forced.acknowledgeBottles'),
    confirmLabel: t('deletion.forced.confirm'),
    tone: 'danger',
  });

  const remove = async (id: number, force: boolean) => {
    const { impact } = await deleteItem(id, { force });
    toast.success(describeDeletion(t, deletedMessage, impact));
    // Pages pass the shared qk constants, so the same key is the same array.
    const forcedKeys = FORCED_DELETION_KEYS.filter((key) => !invalidates.includes(key));
    invalidateQueries(force ? [...invalidates, ...forcedKeys] : invalidates);
  };

  return async (id) => {
    try {
      await remove(id, false);
    } catch (error) {
      const impact = readDeletionImpact(error);
      // Only a refusal that lists what uses the item can be forced, not another conflict.
      if (!impact || !(await confirmForcedDeletion(impact))) {
        toast.error(describeMutationError(error, t));
        return;
      }
      try {
        await remove(id, true);
      } catch (forcedError) {
        toast.error(describeMutationError(forcedError, t));
      }
    }
  };
}
