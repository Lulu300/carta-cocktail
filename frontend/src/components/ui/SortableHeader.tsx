interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}

export default function SortableHeader({
  label, sortKey, currentSortKey, sortDirection, onSort, className = '',
}: SortableHeaderProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <th
      className={`text-left px-6 py-3 text-sm text-gray-400 font-medium cursor-pointer select-none hover:text-amber-400 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className={`inline-flex flex-col text-[10px] leading-none ${isActive ? 'text-amber-400' : 'text-gray-600'}`}>
          <span className={isActive && sortDirection === 'asc' ? 'text-amber-400' : ''}>▲</span>
          <span className={isActive && sortDirection === 'desc' ? 'text-amber-400' : ''}>▼</span>
        </span>
      </div>
    </th>
  );
}
