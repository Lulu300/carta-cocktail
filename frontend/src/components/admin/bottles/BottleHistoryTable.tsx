import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Bottle } from '../../../types';
import { cx } from '../../ui/classNames';
import { BottleRowActions, type BottleActions } from './BottleRow';

interface BottleHistoryTableProps extends BottleActions {
  /** The empty bottles. */
  bottles: Bottle[];
}

const HEADER_CLASSES = 'px-6 py-3 text-sm text-fg-muted font-medium';

/** Collapsed list of the empty bottles, kept for their history. */
export default function BottleHistoryTable({ bottles, onEdit, onDelete }: BottleHistoryTableProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [isOpen, setIsOpen] = useState(false);

  if (bottles.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 text-fg-muted hover:text-fg transition-colors mb-3"
      >
        <svg aria-hidden="true" className={cx('w-4 h-4 transition-transform', isOpen && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold uppercase tracking-wider">
          {t('bottles.historyTitle')} ({bottles.length})
        </span>
      </button>
      {isOpen && (
        <div className="bg-surface border border-line rounded-xl overflow-hidden opacity-60">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>
                <th className={cx(HEADER_CLASSES, 'text-left')}>{t('bottles.name')}</th>
                <th className={cx(HEADER_CLASSES, 'text-left')}>{t('bottles.category')}</th>
                <th className={cx(HEADER_CLASSES, 'text-left')}>{t('bottles.capacityMl')}</th>
                <th className={cx(HEADER_CLASSES, 'text-left')}>{t('bottles.purchasePrice')}</th>
                <th className={cx(HEADER_CLASSES, 'text-right')}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-fg-muted">
              {bottles.map((bottle) => (
                <tr key={bottle.id} className="hover:bg-line/50">
                  <td className="px-6 py-4 font-medium">{bottle.name}</td>
                  <td className="px-6 py-4">{bottle.category ? localize(bottle.category) : ''}</td>
                  <td className="px-6 py-4">{bottle.capacityMl} ml</td>
                  <td className="px-6 py-4">{bottle.purchasePrice ? `${bottle.purchasePrice} €` : '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <BottleRowActions bottle={bottle} onEdit={onEdit} onDelete={onDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
