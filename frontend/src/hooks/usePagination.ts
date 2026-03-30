import { useState, useMemo } from 'react';

interface UsePaginationResult<T> {
  paginatedItems: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function usePagination<T>(
  items: T[],
  defaultPageSize = 25,
): UsePaginationResult<T> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 if current page exceeds total
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const setPage = (p: number) => {
    setPageRaw(Math.max(1, Math.min(p, totalPages)));
  };

  const setPageSize = (size: number) => {
    setPageSizeRaw(size);
    setPageRaw(1);
  };

  return {
    paginatedItems,
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    setPage,
    setPageSize,
  };
}
