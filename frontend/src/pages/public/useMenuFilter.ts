import { useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import type { Menu, MenuBottle, MenuCocktail, MenuSection } from '../../types';
import {
  buildSearchText,
  getCocktailSearchText,
  getEntityNames,
  matchesSearchText,
  type LocalizeName,
} from '../../utils/cocktailSearch';

type MenuItem = MenuCocktail | MenuBottle;

/**
 * - `section`: a section defined by the admin;
 * - `unsectioned`: items left out of every section;
 * - `category`: default grouping of a bottle menu without sections;
 * - `all`: a cocktail menu without sections, shown as one untitled list.
 */
export type MenuBlockKind = 'section' | 'unsectioned' | 'category' | 'all';

export interface MenuBlock<Item> {
  /** DOM id of the block, the target of the section navigation. */
  anchorId: string;
  title: string;
  kind: MenuBlockKind;
  items: Item[];
}

/** Identical bottles (same name, capacity, category and strength) shown as one row. */
export interface BottleGroupEntry {
  key: string;
  name: string;
  alcoholPercentage: number | null;
  capacityMl: number;
  count: number;
  locations: { name: string; count: number }[];
}

export interface MenuFilterResult {
  cocktailBlocks: MenuBlock<MenuCocktail>[];
  bottleBlocks: MenuBlock<BottleGroupEntry>[];
  /** Cocktails or bottle rows left once the search is applied. */
  resultCount: number;
  /** False when the menu has nothing to show, whatever the search. */
  hasItems: boolean;
}

interface IndexedMenu {
  cocktailBlocks: MenuBlock<MenuCocktail>[];
  bottleBlocks: MenuBlock<MenuBottle>[];
  /** Normalized searchable text of each menu item, by menu item id. */
  searchTexts: Map<number, string>;
}

export function isBottleMenu(menu: Menu): boolean {
  return menu.type === 'APEROS' || menu.type === 'DIGESTIFS';
}

/** Items without a section come first, then each section in the admin's order. */
function splitBySection<Item extends MenuItem>(
  items: Item[],
  sections: MenuSection[],
  unsectionedTitle: string,
): MenuBlock<Item>[] {
  return [
    {
      anchorId: 'section-unsectioned',
      title: unsectionedTitle,
      kind: 'unsectioned',
      items: items.filter((item) => !item.menuSectionId),
    },
    ...sections.map((section): MenuBlock<Item> => ({
      anchorId: `section-${section.id}`,
      title: section.name,
      kind: 'section',
      items: items.filter((item) => item.menuSectionId === section.id),
    })),
  ];
}

/** One block per category name, sorted by name. */
function splitByCategory(bottles: MenuBottle[], localize: LocalizeName, otherTitle: string): MenuBlock<MenuBottle>[] {
  const blocks = new Map<string, MenuBlock<MenuBottle>>();
  for (const menuBottle of bottles) {
    const category = menuBottle.bottle?.category;
    const title = category ? localize(category) : otherTitle;
    let block = blocks.get(title);
    if (!block) {
      block = { anchorId: `section-category-${category?.id ?? 'other'}`, title, kind: 'category', items: [] };
      blocks.set(title, block);
    }
    block.items.push(menuBottle);
  }
  return [...blocks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function getBottleSearchText(menuBottle: MenuBottle, localize: LocalizeName): string {
  const bottle = menuBottle.bottle;
  return buildSearchText([bottle?.name, ...getEntityNames(bottle?.category, localize)]);
}

function indexMenu(menu: Menu, localize: LocalizeName, t: TFunction): IndexedMenu {
  const sections = menu.sections ?? [];
  const searchTexts = new Map<number, string>();

  if (isBottleMenu(menu)) {
    const bottles = (menu.bottles ?? []).filter((item) => !item.isHidden && item.bottle);
    bottles.forEach((item) => searchTexts.set(item.id, getBottleSearchText(item, localize)));
    const bottleBlocks = sections.length > 0
      ? splitBySection(bottles, sections, t('public.withoutSection'))
      : splitByCategory(bottles, localize, t('public.other'));
    return { cocktailBlocks: [], bottleBlocks, searchTexts };
  }

  const cocktails = (menu.cocktails ?? []).filter((item) => !item.isHidden && item.cocktail);
  cocktails.forEach((item) => searchTexts.set(item.id, getCocktailSearchText(item.cocktail!, localize)));
  const cocktailBlocks = sections.length > 0
    ? splitBySection(cocktails, sections, t('public.withoutSection'))
    : [{ anchorId: 'section-all', title: '', kind: 'all' as const, items: cocktails }];
  return { cocktailBlocks, bottleBlocks: [], searchTexts };
}

/**
 * Groups identical bottles, keeping the order of the menu (bottle positions):
 * a group takes the place of its first bottle.
 */
export function groupMenuBottles(bottles: MenuBottle[]): BottleGroupEntry[] {
  const groups = new Map<string, BottleGroupEntry>();
  for (const { bottle } of bottles) {
    if (!bottle) continue;
    const key = `${bottle.name.toLowerCase()}|${bottle.capacityMl}|${bottle.categoryId}|${bottle.alcoholPercentage ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: bottle.name,
        alcoholPercentage: bottle.alcoholPercentage,
        capacityMl: bottle.capacityMl,
        count: 0,
        locations: [],
      };
      groups.set(key, group);
    }
    group.count++;
    if (bottle.location) addLocation(group, bottle.location);
  }
  for (const group of groups.values()) {
    group.locations.sort((a, b) => b.count - a.count);
  }
  return [...groups.values()];
}

function addLocation(group: BottleGroupEntry, location: string) {
  const existing = group.locations.find((item) => item.name.toLowerCase() === location.toLowerCase());
  if (existing) existing.count++;
  else group.locations.push({ name: location, count: 1 });
}

function keepMatches<Item extends MenuItem>(
  blocks: MenuBlock<Item>[],
  matches: (item: Item) => boolean,
): MenuBlock<Item>[] {
  return blocks
    .map((block) => ({ ...block, items: block.items.filter(matches) }))
    .filter((block) => block.items.length > 0);
}

function filterMenu(indexed: IndexedMenu, query: string): MenuFilterResult {
  const matches = (item: MenuItem) => matchesSearchText(indexed.searchTexts.get(item.id) ?? '', query);
  const cocktailBlocks = keepMatches(indexed.cocktailBlocks, matches);
  const bottleBlocks = keepMatches(indexed.bottleBlocks, matches)
    .map((block) => ({ ...block, items: groupMenuBottles(block.items) }));
  const resultCount = [...cocktailBlocks, ...bottleBlocks].reduce((total, block) => total + block.items.length, 0);
  return { cocktailBlocks, bottleBlocks, resultCount, hasItems: indexed.searchTexts.size > 0 };
}

/**
 * Blocks of a public menu filtered by the search. The searchable text is built
 * once per menu and language; typing only runs the matching, with a deferred
 * query so the input stays responsive on a slow phone.
 */
export function useMenuFilter(menu: Menu, query: string): MenuFilterResult {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const deferredQuery = useDeferredValue(query);

  const indexed = useMemo(() => indexMenu(menu, localize, t), [menu, localize, t]);
  return useMemo(() => filterMenu(indexed, deferredQuery), [indexed, deferredQuery]);
}
