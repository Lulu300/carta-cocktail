import { useState, useMemo } from 'react';

type SortDirection = 'asc' | 'desc';

interface UseSortResult<T> {
  sortedItems: T[];
  sortKey: string | null;
  sortDirection: SortDirection;
  toggleSort: (key: string) => void;
  resetSort: () => void;
}

export function useSort<T>(
  items: T[],
  defaultKey?: string,
  defaultDirection: SortDirection = 'asc',
): UseSortResult<T> {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const resetSort = () => {
    setSortKey(null);
    setSortDirection('asc');
  };

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;

    return [...items].sort((a, b) => {
      const aVal = getNestedValue(a as unknown as Record<string, unknown>, sortKey);
      const bVal = getNestedValue(b as unknown as Record<string, unknown>, sortKey);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDirection]);

  return { sortedItems, sortKey, sortDirection, toggleSort, resetSort };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], obj);
}
