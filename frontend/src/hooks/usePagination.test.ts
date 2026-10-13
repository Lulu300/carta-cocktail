import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

const numbers = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe('usePagination', () => {
  it('shows the first page of 25 items by default', () => {
    const { result } = renderHook(() => usePagination(numbers(60)));

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalItems).toBe(60);
    expect(result.current.paginatedItems).toEqual(numbers(25));
  });

  it('keeps a single empty page for an empty list', () => {
    const { result } = renderHook(() => usePagination([]));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toEqual([]);
  });

  it('moves to a page, kept between the first and the last one', () => {
    const { result } = renderHook(() => usePagination(numbers(60)));

    act(() => result.current.setPage(3));
    expect(result.current.paginatedItems).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);

    act(() => result.current.setPage(9));
    expect(result.current.page).toBe(3);

    act(() => result.current.setPage(0));
    expect(result.current.page).toBe(1);
  });

  it('goes back to the first page when the page size changes', () => {
    const { result } = renderHook(() => usePagination(numbers(60), 10));
    act(() => result.current.setPage(4));

    act(() => result.current.setPageSize(50));

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.totalPages).toBe(2);
  });

  it('brings a page left out of range by a filter back to the last page', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: numbers(45) },
    });
    act(() => result.current.setPage(5));

    rerender({ items: numbers(15) });

    expect(result.current.page).toBe(2);
    expect(result.current.paginatedItems).toEqual([11, 12, 13, 14, 15]);
  });
});
