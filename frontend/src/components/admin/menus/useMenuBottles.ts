import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { menuBottles as menuBottlesApi, type MenuBottleExclusion } from '../../../services/api';
import type { MenuBottle } from '../../../types';
import { qk } from '../../../queries/keys';
import type { MenuBottleEntry } from './menuBottleGroups';
import { orderByIds } from './moveItem';
import { useMenuMutation, type MenuMutation } from './useMenuMutation';

export type EntryChanges = Pick<MenuBottle, 'isHidden'> | Pick<MenuBottle, 'menuSectionId'>;

interface EntriesUpdate {
  entryIds: number[];
  changes: EntryChanges;
}

export interface MenuBottlesMutations {
  /** Changes the visibility or the section of a group of bottles. */
  update: MenuMutation<EntriesUpdate>;
  /** Takes every entry id of the menu, in the new order. */
  reorder: MenuMutation<number[]>;
  /** Removes a group of bottles from a system menu, in one request. */
  exclude: MenuMutation<MenuBottleEntry[]>;
  restore: MenuMutation<MenuBottleExclusion>;
}

/** The bottles removed from a system menu. */
export function useMenuExclusions(menuId: number): UseQueryResult<MenuBottleExclusion[], Error> {
  return useQuery({ queryKey: qk.menuExclusions(menuId), queryFn: () => menuBottlesApi.exclusions(menuId) });
}

function byBottleName(a: MenuBottleExclusion, b: MenuBottleExclusion): number {
  return a.bottle.name.localeCompare(b.bottle.name);
}

/** A restored bottle, shown at the end of the menu until the server gives its id. */
function restoredEntry(menuId: number, exclusion: MenuBottleExclusion, entries: MenuBottle[]): MenuBottle {
  return {
    id: -exclusion.bottleId,
    menuId,
    bottleId: exclusion.bottleId,
    bottle: exclusion.bottle,
    menuSectionId: null,
    position: entries.length,
    isHidden: false,
  };
}

/** Changes to the bottles of a menu, saved at once. */
export function useMenuBottles(menuId: number): MenuBottlesMutations {
  const update = useMenuMutation<EntriesUpdate>({
    menuId,
    mutationFn: ({ entryIds, changes }) => Promise.all(entryIds.map((id) => menuBottlesApi.update(id, changes))),
    applyOptimistic: (cache, { entryIds, changes }) => cache.menu((menu) => ({
      ...menu,
      bottles: menu.bottles?.map((entry) => (entryIds.includes(entry.id) ? { ...entry, ...changes } : entry)),
    })),
  });

  const reorder = useMenuMutation<number[]>({
    menuId,
    mutationFn: (ids) => menuBottlesApi.reorder(menuId, ids),
    applyOptimistic: (cache, ids) => cache.menu((menu) => ({ ...menu, bottles: orderByIds(menu.bottles ?? [], ids) })),
  });

  const exclude = useMenuMutation<MenuBottleEntry[]>({
    menuId,
    mutationFn: (entries) => menuBottlesApi.exclude(menuId, entries.map((entry) => entry.bottleId)),
    applyOptimistic: (cache, entries) => {
      const bottleIds = entries.map((entry) => entry.bottleId);
      cache.menu((menu) => ({ ...menu, bottles: menu.bottles?.filter((entry) => !bottleIds.includes(entry.bottleId)) }));
      const excluded = entries.map(({ bottleId, bottle }) => ({ menuId, bottleId, bottle, createdAt: new Date().toISOString() }));
      cache.exclusions((list) => [...list, ...excluded].sort(byBottleName));
    },
  });

  const restore = useMenuMutation<MenuBottleExclusion>({
    menuId,
    mutationFn: (exclusion) => menuBottlesApi.restore(menuId, exclusion.bottleId),
    applyOptimistic: (cache, exclusion) => {
      cache.exclusions((list) => list.filter((item) => item.bottleId !== exclusion.bottleId));
      cache.menu((menu) => {
        const entries = menu.bottles ?? [];
        return { ...menu, bottles: [...entries, restoredEntry(menuId, exclusion, entries)] };
      });
    },
  });

  return { update, reorder, exclude, restore };
}
