import { cx } from './classNames';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}

/** Column header that sorts the table: a real button, so it sorts from the keyboard too. */
export default function SortableHeader({
  label, sortKey, currentSortKey, sortDirection, onSort, className = '',
}: SortableHeaderProps) {
  const isActive = currentSortKey === sortKey;
  const ariaSort = isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <th aria-sort={ariaSort} className={cx('text-left px-6 py-3 text-sm text-fg-muted font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 rounded font-medium hover:text-accent transition-colors"
      >
        <span>{label}</span>
        {/* Decorative: aria-sort on the header tells the order to screen readers. */}
        <span aria-hidden="true" className="inline-flex flex-col text-[10px] leading-none text-fg-muted/50">
          <span className={isActive && sortDirection === 'asc' ? 'text-accent' : ''}>▲</span>
          <span className={isActive && sortDirection === 'desc' ? 'text-accent' : ''}>▼</span>
        </span>
      </button>
    </th>
  );
}
