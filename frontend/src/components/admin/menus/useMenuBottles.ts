import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { menuBottles as menuBottlesApi, type MenuBottleExclusion } from '../../../services/api';
import type { Bottle, MenuBottle } from '../../../types';
import { qk } from '../../../queries/keys';
import { isAvailableForMenu } from './bottleMenuType';
import { isSavedEntry, type MenuBottleEntry } from './menuBottleGroups';
import { orderByIds } from './moveItem';
import { updateExclusions, updateMenu, useMenuMutation, type MenuMutation, type MenuState } from './useMenuMutation';

export type EntryChanges = Pick<MenuBottle, 'isHidden'> | Pick<MenuBottle, 'menuSectionId'>;

interface EntriesUpdate {
  entryIds: number[];
  changes: EntryChanges;
}

export interface MenuBottlesMutations {
  /** Changes the visibility or the section of a group of bottles, in one request. */
  update: MenuMutation<EntriesUpdate>;
  /** Takes every entry id of the menu, in the new order. */
  reorder: MenuMutation<number[]>;
  /** Adds a group of bottles at the end of a personal menu, in one request. */
  add: MenuMutation<Bottle[]>;
  /** Removes a group of bottles from a personal menu, in one request. */
  remove: MenuMutation<MenuBottleEntry[]>;
  /** Removes a group of bottles from a system menu, in one request. */
  exclude: MenuMutation<MenuBottleEntry[]>;
  /** Puts a group of removed bottles back, in one request. */
  restore: MenuMutation<MenuBottleExclusion[]>;
}

/** The bottles removed from a system menu. */
export function useMenuExclusions(menuId: number): UseQueryResult<MenuBottleExclusion[], Error> {
  return useQuery({ queryKey: qk.menuExclusions(menuId), queryFn: () => menuBottlesApi.exclusions(menuId) });
}

function byBottleName(a: MenuBottleExclusion, b: MenuBottleExclusion): number {
  return a.bottle.name.localeCompare(b.bottle.name);
}

/**
 * The order chosen on screen, applied to the given entries: an entry it does
 * not list (e.g. its removal was refused) keeps its place after the others,
 * and an id that is not among the entries is dropped.
 */
function applyOrder(chosenIds: number[], entryIds: number[]): number[] {
  return [
    ...chosenIds.filter((id) => entryIds.includes(id)),
    ...entryIds.filter((id) => !chosenIds.includes(id)),
  ];
}

/** The order to send: applied to the entries the server holds, which all have a real id. */
function orderForServer(chosenIds: number[], confirmed: MenuState): number[] {
  return applyOrder(chosenIds, (confirmed.menu?.bottles ?? []).filter(isSavedEntry).map((entry) => entry.id));
}

/** Added or restored bottles, shown at the end of the menu with a temporary id until the server gives theirs. */
function appendBottles(state: MenuState, menuId: number, bottles: Bottle[]): MenuState {
  return updateMenu(state, (menu) => {
    const entries = menu.bottles ?? [];
    const appended = bottles.map((bottle, index) => ({
      id: -bottle.id,
      menuId,
      bottleId: bottle.id,
      bottle,
      menuSectionId: null,
      position: entries.length + index,
      isHidden: false,
    }));
    return { ...menu, bottles: [...entries, ...appended] };
  });
}

function filterEntries(state: MenuState, keep: (entry: MenuBottle) => boolean): MenuState {
  return updateMenu(state, (menu) => ({ ...menu, bottles: menu.bottles?.filter(keep) }));
}

/** Changes to the bottles of a menu, saved at once. */
export function useMenuBottles(menuId: number): MenuBottlesMutations {
  const update = useMenuMutation<EntriesUpdate>({
    menuId,
    mutationFn: ({ entryIds, changes }) => menuBottlesApi.updateEntries(menuId, entryIds, changes),
    applyOptimistic: (state, { entryIds, changes }) => updateMenu(state, (menu) => ({
      ...menu,
      bottles: menu.bottles?.map((entry) => (entryIds.includes(entry.id) ? { ...entry, ...changes } : entry)),
    })),
  });

  const reorder = useMenuMutation<number[]>({
    menuId,
    mutationFn: (ids, confirmed) => menuBottlesApi.reorder(menuId, orderForServer(ids, confirmed)),
    applyOptimistic: (state, ids) => updateMenu(state, (menu) => {
      const entries = menu.bottles ?? [];
      return { ...menu, bottles: orderByIds(entries, applyOrder(ids, entries.map((entry) => entry.id))) };
    }),
  });

  const add = useMenuMutation<Bottle[]>({
    menuId,
    mutationFn: (bottles) => menuBottlesApi.addBottles(menuId, bottles.map((bottle) => bottle.id)),
    applyOptimistic: (state, bottles) => appendBottles(state, menuId, bottles),
  });

  const remove = useMenuMutation<MenuBottleEntry[]>({
    menuId,
    mutationFn: (entries) => menuBottlesApi.removeEntries(menuId, entries.map((entry) => entry.id)),
    applyOptimistic: (state, entries) => {
      const entryIds = entries.map((entry) => entry.id);
      return filterEntries(state, (entry) => !entryIds.includes(entry.id));
    },
  });

  const exclude = useMenuMutation<MenuBottleEntry[]>({
    menuId,
    mutationFn: (entries) => menuBottlesApi.exclude(menuId, entries.map((entry) => entry.bottleId)),
    applyOptimistic: (state, entries) => {
      const bottleIds = entries.map((entry) => entry.bottleId);
      const excluded = entries.map(({ bottleId, bottle }) => ({ menuId, bottleId, bottle, createdAt: new Date().toISOString() }));
      const remaining = filterEntries(state, (entry) => !bottleIds.includes(entry.bottleId));
      return updateExclusions(remaining, (list) => [...list, ...excluded].sort(byBottleName));
    },
  });

  const restore = useMenuMutation<MenuBottleExclusion[]>({
    menuId,
    mutationFn: (exclusions) => menuBottlesApi.restore(menuId, exclusions.map(({ bottleId }) => bottleId)),
    applyOptimistic: (state, exclusions) => {
      const bottleIds = exclusions.map((exclusion) => exclusion.bottleId);
      const withoutExclusions = updateExclusions(state, (list) => list.filter((item) => !bottleIds.includes(item.bottleId)));
      // The server only puts back a bottle still checked for the menu's type: the others just leave the list.
      const { menu } = state;
      const bottles = exclusions.map((exclusion) => exclusion.bottle);
      const restored = menu ? bottles.filter((bottle) => isAvailableForMenu(bottle, menu)) : [];
      return appendBottles(withoutExclusions, menuId, restored);
    },
  });

  return { update, reorder, add, remove, exclude, restore };
}
