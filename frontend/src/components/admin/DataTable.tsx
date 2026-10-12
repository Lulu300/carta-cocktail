import { Fragment, type Key, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../ui/classNames';
import Pagination from '../ui/Pagination';
import Skeleton from '../ui/Skeleton';
import SortableHeader from '../ui/SortableHeader';
import LoadError from './LoadError';

export interface Column<T> {
  key: string;
  header: string;
  /** Sorts on `key`, which may be a nested path such as `_count.bottles`. */
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Extra classes of the cells, e.g. to mute a secondary column. */
  className?: string;
  /** Content of the cell; unused when the table renders its rows with `renderRow`. */
  render?: (row: T) => ReactNode;
}

/** The part of `useSort` the table needs. */
interface SortState {
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  toggleSort: (key: string) => void;
}

/** The part of `usePagination` the table needs. */
interface PaginationState {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  /** The rows of the current page. */
  rows: T[];
  getRowKey: (row: T) => Key;
  sort: SortState;
  pagination: PaginationState;
  /**
   * Renders the `<tr>` elements of a row, for rows that are not one line per
   * item (e.g. a group that expands into sub-rows). Each column's `render` is
   * used otherwise.
   */
  renderRow?: (row: T) => ReactNode;
  isLoading: boolean;
  /** A failed load shows an error with a retry button instead of the empty label. */
  isError: boolean;
  onRetry: () => void;
  emptyLabel: string;
}

const SKELETON_ROWS = 3;

function alignClass(align: Column<unknown>['align']) {
  return align === 'right' ? 'text-right' : 'text-left';
}

/** Sortable, paginated admin table that never shows its empty label before the data is there. */
export default function DataTable<T>({
  columns, rows, getRowKey, sort, pagination, renderRow, isLoading, isError, onRetry, emptyLabel,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const isEmpty = !isLoading && !isError && rows.length === 0;

  const renderCells = (row: T) => (
    <tr className="hover:bg-line/50">
      {columns.map((column) => (
        <td key={column.key} className={cx('px-6 py-4', alignClass(column.align), column.className)}>
          {column.render?.(row)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-canvas">
          <tr>
            {columns.map((column) => (column.sortable ? (
              <SortableHeader
                key={column.key}
                label={column.header}
                sortKey={column.key}
                currentSortKey={sort.sortKey}
                sortDirection={sort.sortDirection}
                onSort={sort.toggleSort}
              />
            ) : (
              <th key={column.key} className={cx('px-6 py-3 text-sm text-fg-muted font-medium', alignClass(column.align))}>
                {column.header}
              </th>
            )))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4"><Skeleton className="h-4" /></td>
                ))}
              </tr>
            ))
            : rows.map((row) => <Fragment key={getRowKey(row)}>{(renderRow ?? renderCells)(row)}</Fragment>)}
        </tbody>
      </table>
      {isLoading && <p role="status" className="sr-only">{t('common.loading')}</p>}
      {isError && <LoadError onRetry={onRetry} />}
      {isEmpty && <div className="text-center py-8 text-fg-muted">{emptyLabel}</div>}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  );
}
