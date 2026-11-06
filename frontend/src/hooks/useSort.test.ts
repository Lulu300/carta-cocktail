import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSort } from './useSort';

interface Row {
  name: string;
  stock: number | null;
  isOpen: boolean;
  category?: { name: string };
}

const rows: Row[] = [
  { name: 'vodka', stock: 3, isOpen: false, category: { name: 'Spirit' } },
  { name: 'Absinthe', stock: null, isOpen: true, category: { name: 'liqueur' } },
  { name: 'Gin', stock: 10, isOpen: true },
];

function names(items: Row[]): string[] {
  return items.map((row) => row.name);
}

describe('useSort', () => {
  it('keeps the original order until a column is chosen', () => {
    const { result } = renderHook(() => useSort(rows));

    expect(result.current.sortKey).toBeNull();
    expect(result.current.sortedItems).toBe(rows);
  });

  it('sorts text without minding the case, then reverses on a second toggle', () => {
    const { result } = renderHook(() => useSort(rows));

    act(() => result.current.toggleSort('name'));
    expect(names(result.current.sortedItems)).toEqual(['Absinthe', 'Gin', 'vodka']);
    expect(result.current.sortDirection).toBe('asc');

    act(() => result.current.toggleSort('name'));
    expect(names(result.current.sortedItems)).toEqual(['vodka', 'Gin', 'Absinthe']);
    expect(result.current.sortDirection).toBe('desc');
  });

  it('sorts numbers as numbers and always puts empty values last', () => {
    const { result } = renderHook(() => useSort(rows, 'stock'));
    expect(names(result.current.sortedItems)).toEqual(['vodka', 'Gin', 'Absinthe']);

    act(() => result.current.toggleSort('stock'));
    expect(names(result.current.sortedItems)).toEqual(['Gin', 'vodka', 'Absinthe']);
  });

  it('puts true before false, and starts a new column in ascending order', () => {
    const { result } = renderHook(() => useSort(rows, 'name', 'desc'));

    act(() => result.current.toggleSort('isOpen'));

    expect(result.current.sortDirection).toBe('asc');
    expect(result.current.sortedItems.map((row) => row.isOpen)).toEqual([true, true, false]);
  });

  it('sorts on a nested path, rows without the value last', () => {
    const { result } = renderHook(() => useSort(rows, 'category.name'));

    expect(names(result.current.sortedItems)).toEqual(['Absinthe', 'vodka', 'Gin']);
  });

  it('goes back to the original order on reset', () => {
    const { result } = renderHook(() => useSort(rows, 'name', 'desc'));

    act(() => result.current.resetSort());

    expect(result.current.sortKey).toBeNull();
    expect(result.current.sortDirection).toBe('asc');
    expect(result.current.sortedItems).toBe(rows);
  });
});
