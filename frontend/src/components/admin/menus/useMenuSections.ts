import { menuSections as menuSectionsApi } from '../../../services/api';
import type { Menu, MenuSection } from '../../../types';
import { orderByIds } from './moveItem';
import { useMenuMutation, type MenuMutation } from './useMenuMutation';

interface SectionRename {
  id: number;
  name: string;
}

export interface MenuSectionsMutations {
  create: MenuMutation<string>;
  rename: MenuMutation<SectionRename>;
  remove: MenuMutation<number>;
  /** Takes every section id of the menu, in the new order. */
  reorder: MenuMutation<number[]>;
}

function withSections(menu: Menu, sections: MenuSection[]): Menu {
  return { ...menu, sections };
}

/** Items of a deleted section move out of any section, as the database does (onDelete: SetNull). */
function withoutSection<T extends { menuSectionId: number | null }>(items: T[] | undefined, sectionId: number) {
  return items?.map((item) => (item.menuSectionId === sectionId ? { ...item, menuSectionId: null } : item));
}

/** The sections of a menu, saved at once like the rest of its composition. */
export function useMenuSections(menuId: number): MenuSectionsMutations {
  const create = useMenuMutation<string>({
    menuId,
    // Not shown before the server answers: the new section needs its id.
    mutationFn: (name) => menuSectionsApi.create(menuId, { name }),
  });

  const rename = useMenuMutation<SectionRename>({
    menuId,
    mutationFn: ({ id, name }) => menuSectionsApi.update(id, { name }),
    applyOptimistic: (cache, { id, name }) => cache.menu((menu) => withSections(
      menu,
      (menu.sections ?? []).map((section) => (section.id === id ? { ...section, name } : section)),
    )),
  });

  const remove = useMenuMutation<number>({
    menuId,
    mutationFn: (id) => menuSectionsApi.delete(id),
    applyOptimistic: (cache, id) => cache.menu((menu) => ({
      ...withSections(menu, (menu.sections ?? []).filter((section) => section.id !== id)),
      cocktails: withoutSection(menu.cocktails, id),
      bottles: withoutSection(menu.bottles, id),
    })),
  });

  const reorder = useMenuMutation<number[]>({
    menuId,
    mutationFn: (ids) => menuSectionsApi.reorder(menuId, ids),
    applyOptimistic: (cache, ids) => cache.menu((menu) => withSections(menu, orderByIds(menu.sections ?? [], ids))),
  });

  return { create, rename, remove, reorder };
}
