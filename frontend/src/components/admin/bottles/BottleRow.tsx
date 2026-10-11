import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Bottle } from '../../../types';
import IconButton from '../../ui/IconButton';
import { cx } from '../../ui/classNames';

export interface BottleActions {
  onEdit: (bottle: Bottle) => void;
  onDelete: (bottle: Bottle) => void;
}

function remainingColor(percent: number): string {
  if (percent > 50) return 'bg-green-500';
  if (percent > 20) return 'bg-yellow-500';
  return 'bg-red-500';
}

/** Fill level of a bottle (or the average of a group), colored by how full it is. */
export function RemainingBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', remainingColor(percent))} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function BottleRowActions({ bottle, onEdit, onDelete }: BottleActions & { bottle: Bottle }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton icon="edit" label={t('common.edit')} onClick={() => onEdit(bottle)} />
      <IconButton icon="delete" label={t('common.delete')} variant="danger" onClick={() => onDelete(bottle)} />
    </div>
  );
}

interface BottleRowProps extends BottleActions {
  bottle: Bottle;
  /** A bottle listed under its expanded group. */
  indented?: boolean;
}

/** Row of an available bottle. */
export default function BottleRow({ bottle, indented = false, onEdit, onDelete }: BottleRowProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();

  return (
    <tr className={cx('hover:bg-line/50', indented && 'bg-canvas/30')}>
      <td className={cx('py-4 font-medium', indented ? 'px-12' : 'px-6')}>
        {indented && <span aria-hidden="true" className="text-fg-muted mr-2">└</span>}
        {bottle.name}
      </td>
      <td className="px-6 py-4 text-fg-muted">{bottle.category ? localize(bottle.category) : ''}</td>
      <td className="px-6 py-4">{bottle.capacityMl} ml</td>
      <td className="px-6 py-4">
        <RemainingBar percent={bottle.remainingPercent} label={`${bottle.remainingPercent}%`} />
      </td>
      <td className="px-6 py-4 text-fg-muted">{bottle.alcoholPercentage ? `${bottle.alcoholPercentage}%` : '-'}</td>
      <td className="px-6 py-4">
        <span className={cx(
          'px-2 py-1 rounded text-xs font-medium',
          bottle.openedAt ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400',
        )}>
          {bottle.openedAt ? t('bottles.opened') : t('bottles.unopened')}
        </span>
      </td>
      <td className="px-6 py-4 text-fg-muted">{bottle.purchasePrice ? `${bottle.purchasePrice} €` : '-'}</td>
      <td className="px-6 py-4 text-right">
        <BottleRowActions bottle={bottle} onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}
