import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../ui/classNames';
import { moveWithinGroup, type SectionGroup } from './groupBySection';
import type { RowMove } from './MenuItemRow';

interface MenuCompositionProps<T> {
  groups: SectionGroup<T>[];
  getKey: (item: T) => string | number;
  /** Receives every item of the menu in its new order, after a move. */
  onReorder: (items: T[]) => void;
  renderItem: (item: T, move: RowMove) => ReactNode;
}

/** The items of a menu under a heading per section; empty sections are left out. */
export default function MenuComposition<T>({ groups, getKey, onReorder, renderItem }: MenuCompositionProps<T>) {
  const { t } = useTranslation();

  const moveFor = (groupIndex: number, index: number, count: number): RowMove => ({
    onUp: () => onReorder(moveWithinGroup(groups, groupIndex, index, index - 1)),
    onDown: () => onReorder(moveWithinGroup(groups, groupIndex, index, index + 1)),
    disableUp: index === 0,
    disableDown: index === count - 1,
  });

  return (
    <div className="space-y-6">
      {groups.map((group, groupIndex) => group.items.length > 0 && (
        <section key={group.section?.id ?? 'none'}>
          <h3 className={cx('text-sm font-semibold mb-2', group.section ? 'text-accent' : 'text-fg-muted')}>
            {group.section?.name ?? t('menus.sections.none')}
          </h3>
          <ul className="space-y-2">
            {group.items.map((item, index) => (
              <Fragment key={getKey(item)}>{renderItem(item, moveFor(groupIndex, index, group.items.length))}</Fragment>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
