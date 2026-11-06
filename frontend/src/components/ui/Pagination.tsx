import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './classNames';

interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

// 40x40 px minimum hit area, like IconButton.
const PAGE_BUTTON_BASE = 'inline-flex items-center justify-center min-w-10 min-h-10 px-2 text-sm rounded-lg transition-colors';
const PAGE_BUTTON_CLASSES = cx(
  PAGE_BUTTON_BASE,
  'text-fg-muted hover:text-fg hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed',
);
const CURRENT_PAGE_CLASSES = cx(PAGE_BUTTON_BASE, 'bg-accent text-on-accent font-semibold');

export default function Pagination({
  page, totalPages, pageSize, totalItems,
  onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const { t } = useTranslation();
  const pageSizeId = useId();

  if (totalItems === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-line">
      <div className="flex items-center gap-3 text-sm text-fg-muted">
        <span>{t('pagination.showing', { start, end, total: totalItems })}</span>
        <label htmlFor={pageSizeId} className="sr-only">{t('pagination.pageSize')}</label>
        <select
          id={pageSizeId}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="bg-canvas border border-line-strong rounded px-2 py-1 text-fg text-sm"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size} / {t('pagination.page')}</option>
          ))}
        </select>
      </div>

      {totalPages > 1 && (
        <nav aria-label={t('pagination.label')} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label={t('pagination.first')}
            className={PAGE_BUTTON_CLASSES}
          >
            <span aria-hidden="true">««</span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label={t('pagination.previous')}
            className={PAGE_BUTTON_CLASSES}
          >
            <span aria-hidden="true">«</span>
          </button>

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} aria-hidden="true" className="px-2 text-sm text-fg-muted">...</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p as number)}
                aria-label={t('pagination.goToPage', { page: p })}
                aria-current={p === page ? 'page' : undefined}
                className={p === page ? CURRENT_PAGE_CLASSES : PAGE_BUTTON_CLASSES}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            aria-label={t('pagination.next')}
            className={PAGE_BUTTON_CLASSES}
          >
            <span aria-hidden="true">»</span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            aria-label={t('pagination.last')}
            className={PAGE_BUTTON_CLASSES}
          >
            <span aria-hidden="true">»»</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | string)[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}
