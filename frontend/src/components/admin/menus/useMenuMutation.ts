import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { MenuBottleExclusion } from '../../../services/api';
import type { Menu } from '../../../types';
import { qk } from '../../../queries/keys';
import { describeMutationError } from '../../../queries/deletionImpact';
import { toast } from '../../ui/ToastStore';

/** The cached data of a menu editor; a part never loaded stays undefined. */
export interface MenuState {
  menu?: Menu;
  exclusions?: MenuBottleExclusion[];
}

interface MenuMutationOptions<Variables, Data> {
  menuId: number;
  /** Receives the state the server has confirmed when the request leaves, earlier refused changes excluded. */
  mutationFn: (variables: Variables, confirmed: MenuState) => Promise<Data>;
  /** Shows the change at once. Left out when the change needs the server's answer, e.g. a new id. */
  applyOptimistic?: (state: MenuState, variables: Variables) => MenuState;
  /** What the server holds after a success; the optimistic change by default. */
  applyConfirmed?: (state: MenuState, variables: Variables, data: Data) => MenuState;
  /** i18n key of a success toast. */
  successMessage?: string;
}

export type MenuMutation<Variables, Data = unknown> = UseMutationResult<Data, Error, Variables, PendingChange>;

interface PendingChange {
  apply: (state: MenuState) => MenuState;
}

/**
 * The changes of one menu waiting for the server: the state it confirmed, and
 * the changes still to answer, in click order. The screen always shows the
 * confirmed state with the pending changes on top, so a refused change goes
 * away without taking the later ones with it.
 */
interface ChangeQueue {
  confirmed: MenuState;
  pending: PendingChange[];
}

// One queue per menu and per query client, shared by every hook that changes the menu.
const queues = new WeakMap<QueryClient, Map<number, ChangeQueue>>();

function queuesOf(queryClient: QueryClient): Map<number, ChangeQueue> {
  let menuQueues = queues.get(queryClient);
  if (!menuQueues) {
    menuQueues = new Map();
    queues.set(queryClient, menuQueues);
  }
  return menuQueues;
}

function readState(queryClient: QueryClient, menuId: number): MenuState {
  return {
    menu: queryClient.getQueryData<Menu>(qk.menu(menuId)),
    exclusions: queryClient.getQueryData<MenuBottleExclusion[]>(qk.menuExclusions(menuId)),
  };
}

function writeState(queryClient: QueryClient, menuId: number, state: MenuState) {
  if (state.menu) queryClient.setQueryData(qk.menu(menuId), state.menu);
  if (state.exclusions) queryClient.setQueryData(qk.menuExclusions(menuId), state.exclusions);
}

function shownState(queue: ChangeQueue): MenuState {
  return queue.pending.reduce((state, change) => change.apply(state), queue.confirmed);
}

/** Applies `update` to the menu only, when it is loaded. */
export function updateMenu(state: MenuState, update: (menu: Menu) => Menu): MenuState {
  return state.menu ? { ...state, menu: update(state.menu) } : state;
}

/** Applies `update` to the removed bottles only, when they are loaded. */
export function updateExclusions(
  state: MenuState,
  update: (exclusions: MenuBottleExclusion[]) => MenuBottleExclusion[],
): MenuState {
  return state.exclusions ? { ...state, exclusions: update(state.exclusions) } : state;
}

/**
 * A change to a menu, saved at once: the screen shows it before the server
 * answers. The changes of one menu reach the server one at a time, in click
 * order; a refused change disappears from the screen with a toast, and the
 * later ones are still saved. The last change to settle refetches the menu.
 */
export function useMenuMutation<Variables, Data = unknown>({
  menuId,
  mutationFn,
  applyOptimistic,
  applyConfirmed = applyOptimistic,
  successMessage,
}: MenuMutationOptions<Variables, Data>): MenuMutation<Variables, Data> {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Also the prefix of the removed bottles' key: one key covers both caches.
  const menuKey = qk.menu(menuId);
  const menuQueues = queuesOf(queryClient);

  const queueOf = (): ChangeQueue => {
    let queue = menuQueues.get(menuId);
    if (!queue) {
      queue = { confirmed: readState(queryClient, menuId), pending: [] };
      menuQueues.set(menuId, queue);
    }
    return queue;
  };

  return useMutation({
    mutationKey: menuKey,
    scope: { id: `menu-${menuId}` },
    mutationFn: (variables) => mutationFn(variables, queueOf().confirmed),
    onMutate: async (variables) => {
      // The queue is set up before any await, so a second click joins the same one.
      const queue = queueOf();
      const change: PendingChange = {
        apply: (state) => (applyOptimistic ? applyOptimistic(state, variables) : state),
      };
      queue.pending.push(change);
      // A refetch landing after this point would overwrite the change shown below.
      await queryClient.cancelQueries({ queryKey: menuKey });
      writeState(queryClient, menuId, shownState(queue));
      return change;
    },
    onSuccess: (data, variables) => {
      const queue = queueOf();
      if (applyConfirmed) queue.confirmed = applyConfirmed(queue.confirmed, variables, data);
      if (successMessage) toast.success(t(successMessage));
    },
    onError: (error) => {
      toast.error(describeMutationError(error, t));
    },
    onSettled: async (_data, _error, _variables, change) => {
      const queue = queueOf();
      queue.pending = queue.pending.filter((pending) => pending !== change);
      // The menus list counts the items of each menu: refreshed when next shown.
      queryClient.invalidateQueries({ queryKey: qk.menus, exact: true, refetchType: 'none' });
      if (queue.pending.length > 0) {
        writeState(queryClient, menuId, shownState(queue));
        return;
      }
      // No change waits: the server state is the truth again.
      writeState(queryClient, menuId, queue.confirmed);
      menuQueues.delete(menuId);
      await queryClient.invalidateQueries({ queryKey: menuKey });
    },
  });
}
