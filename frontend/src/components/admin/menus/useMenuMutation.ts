import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient, type QueryClient, type QueryKey, type UseMutationResult } from '@tanstack/react-query';
import type { MenuBottleExclusion } from '../../../services/api';
import type { Menu } from '../../../types';
import { qk } from '../../../queries/keys';
import { describeMutationError } from '../../../queries/deletionImpact';
import { toast } from '../../ui/ToastStore';

type Updater<T> = (current: T) => T;

/** Changes the cached menu, and the bottles removed from it, before the server answers. */
export interface MenuCacheEditor {
  menu: (updater: Updater<Menu>) => void;
  exclusions: (updater: Updater<MenuBottleExclusion[]>) => void;
}

interface MenuMutationOptions<Variables> {
  menuId: number;
  mutationFn: (variables: Variables) => Promise<unknown>;
  /** Shows the change at once. Left out when the change needs the server's answer, e.g. a new id. */
  applyOptimistic?: (cache: MenuCacheEditor, variables: Variables) => void;
}

/** What the cache held before the change, restored if the server refuses it. */
type CacheSnapshot = [QueryKey, unknown][];

export type MenuMutation<Variables> = UseMutationResult<unknown, Error, Variables, CacheSnapshot>;

function menuCacheEditor(queryClient: QueryClient, menuId: number): MenuCacheEditor {
  return {
    menu: (updater) => queryClient.setQueryData<Menu>(qk.menu(menuId), (menu) => menu && updater(menu)),
    exclusions: (updater) =>
      queryClient.setQueryData<MenuBottleExclusion[]>(qk.menuExclusions(menuId), (list) => list && updater(list)),
  };
}

/**
 * A change to the composition of a menu, saved at once: the screen shows it
 * before the server answers and goes back to its previous state, with a toast,
 * if the server refuses it.
 */
export function useMenuMutation<Variables>({
  menuId,
  mutationFn,
  applyOptimistic,
}: MenuMutationOptions<Variables>): MenuMutation<Variables> {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Also the prefix of the removed bottles' key: one key covers both caches.
  const menuKey = qk.menu(menuId);

  return useMutation({
    mutationKey: menuKey,
    // The changes of one menu reach the server one at a time, in the order of the clicks.
    scope: { id: `menu-${menuId}` },
    mutationFn,
    onMutate: async (variables) => {
      // A refetch landing after this point would overwrite the change shown below.
      await queryClient.cancelQueries({ queryKey: menuKey });
      const snapshot: CacheSnapshot = queryClient.getQueriesData({ queryKey: menuKey });
      applyOptimistic?.(menuCacheEditor(queryClient, menuId), variables);
      return snapshot;
    },
    onError: (error, _variables, snapshot) => {
      snapshot?.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      toast.error(describeMutationError(error, t));
    },
    onSettled: async () => {
      // The menus list counts the items of each menu: refreshed when next shown.
      queryClient.invalidateQueries({ queryKey: qk.menus, exact: true, refetchType: 'none' });
      // While another change of this menu waits, a refetch would show the server
      // state without it: the last change to settle refreshes the menu.
      if (queryClient.isMutating({ mutationKey: menuKey }) > 1) return;
      await queryClient.invalidateQueries({ queryKey: menuKey });
    },
  });
}
