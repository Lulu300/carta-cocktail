import { useMemo, useState } from 'react';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Bottle } from '../../../types';
import type { BottleExportFilters } from './ExportMenu';

/** A bottle with its category name in the current language, so the table can sort on it. */
export type ListedBottle = Bottle & { categoryName: string };

/** True for any value when the query is blank. */
function includesText(value: string | null | undefined, query: string): boolean {
  return (value ?? '').toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Filters of the bottles page: a name search, a category (picked in the list or
 * typed) and a location. Splits what they keep into available and empty bottles.
 */
export function useBottleFilters(bottles: Bottle[] | undefined) {
  const localize = useLocalizedName();
  const [search, setSearch] = useState('');
  const [categoryText, setCategoryText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState('');

  const listedBottles = useMemo<ListedBottle[]>(
    () => (bottles ?? []).map((bottle) => ({
      ...bottle,
      categoryName: bottle.category ? localize(bottle.category) : '',
    })),
    [bottles, localize],
  );

  const locations = useMemo(
    () => [...new Set(listedBottles.map((bottle) => bottle.location).filter((value): value is string => !!value))].sort(),
    [listedBottles],
  );

  const { activeBottles, emptyBottles } = useMemo(() => {
    // A category picked in the list matches by id; a typed one by name.
    const matchesCategory = (bottle: ListedBottle) => (categoryId !== null
      ? bottle.categoryId === categoryId
      : includesText(bottle.categoryName, categoryText));
    const matching = listedBottles.filter((bottle) =>
      includesText(bottle.name, search) && matchesCategory(bottle) && includesText(bottle.location, location),
    );
    return {
      activeBottles: matching.filter((bottle) => bottle.remainingPercent > 0),
      emptyBottles: matching.filter((bottle) => bottle.remainingPercent === 0),
    };
  }, [listedBottles, search, categoryId, categoryText, location]);

  const exportFilters: BottleExportFilters = {
    categoryId: categoryId ?? undefined,
    search: search.trim() || undefined,
    location: location.trim() || undefined,
  };

  const setCategory = (text: string, id: number | null) => {
    setCategoryText(text);
    setCategoryId(id);
  };

  const isFiltered = [search, categoryText, location].some((value) => value.trim() !== '');

  return {
    search, setSearch,
    categoryText, categoryId, setCategory,
    location, setLocation,
    locations, activeBottles, emptyBottles, exportFilters, isFiltered,
  };
}
