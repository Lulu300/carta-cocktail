import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { BottleGroup } from '../../../utils/bottleGrouping';
import { cx } from '../../ui/classNames';
import BottleRow, { RemainingBar, type BottleActions } from './BottleRow';

interface BottleGroupRowProps extends BottleActions {
  group: BottleGroup;
  /** Kept by the page, so a group stays open across pagination and filters. */
  expanded: boolean;
  onToggle: (groupKey: string) => void;
}

function averageRemaining(group: BottleGroup): number {
  const total = group.bottles.reduce((sum, bottle) => sum + bottle.remainingPercent, 0);
  return Math.round(total / group.bottles.length);
}

/** Row of identical bottles with their count; a click lists each bottle below it. */
export default function BottleGroupRow({ group, expanded, onToggle, onEdit, onDelete }: BottleGroupRowProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const average = averageRemaining(group);

  return (
    <>
      {/*
        The whole row toggles on click. The button gives it a keyboard target and a
        state for screen readers; its clicks (Enter, Space included) bubble up to the row.
      */}
      <tr className="hover:bg-line/50 cursor-pointer" onClick={() => onToggle(group.key)}>
        <td className="px-6 py-4 font-medium">
          <button type="button" aria-expanded={expanded} className="flex items-center gap-2 rounded text-left">
            <svg aria-hidden="true" className={cx('w-4 h-4 text-fg-muted transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {group.name}
            <span className="bg-accent/20 text-accent text-xs font-bold px-2 py-0.5 rounded-full">×{group.bottles.length}</span>
          </button>
        </td>
        <td className="px-6 py-4 text-fg-muted">{group.category ? localize(group.category) : ''}</td>
        <td className="px-6 py-4">{t('units.ml', { value: group.capacityMl })}</td>
        <td className="px-6 py-4 text-fg-muted">
          <RemainingBar percent={average} label={`~${average}%`} />
        </td>
        <td className="px-6 py-4 text-fg-muted">{group.alcoholPercentage ? `${group.alcoholPercentage}%` : '-'}</td>
        <td className="px-6 py-4 text-fg-muted">-</td>
        <td className="px-6 py-4 text-fg-muted">-</td>
        <td className="px-6 py-4"></td>
      </tr>
      {expanded && group.bottles.map((bottle) => (
        <BottleRow key={bottle.id} bottle={bottle} indented onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}
