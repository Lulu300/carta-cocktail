import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MenuSection } from '../../../types';
import IconButton from '../../ui/IconButton';
import { cx, focusRingClasses } from '../../ui/classNames';
import ReorderButtons from './ReorderButtons';
import SectionSelect from './SectionSelect';

export interface RowMove {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}

interface MenuItemRowProps {
  /** Name of the item, for the accessible names of its buttons. */
  label: string;
  /** Name and badges of the item. */
  children: ReactNode;
  /** Extra information shown before the visibility button. */
  details?: ReactNode;
  isHidden: boolean;
  onToggleHidden: () => void;
  sections: MenuSection[];
  sectionId: number | null;
  onSectionChange: (sectionId: number | null) => void;
  move: RowMove;
  /** Left out when the item cannot be removed from this menu. */
  onRemove?: () => void;
  /** Disables every action, e.g. while the item waits for its id from the server. */
  disabled?: boolean;
}

/** One item (a cocktail or a group of bottles) of a menu, with its actions. */
export default function MenuItemRow({
  label, children, details, isHidden, onToggleHidden, sections, sectionId, onSectionChange, move, onRemove, disabled = false,
}: MenuItemRowProps) {
  const { t } = useTranslation();

  return (
    <li className={cx('flex items-center gap-3 p-3 rounded-lg border border-line-strong bg-canvas', isHidden && 'opacity-50')}>
      <ReorderButtons
        label={label}
        onUp={move.onUp}
        onDown={move.onDown}
        disableUp={disabled || move.disableUp}
        disableDown={disabled || move.disableDown}
      />
      <div className="flex-1 min-w-0">{children}</div>
      {sections.length > 0 && (
        <SectionSelect value={sectionId} sections={sections} onChange={onSectionChange} label={label} disabled={disabled} />
      )}
      {details}
      <button
        type="button"
        onClick={onToggleHidden}
        disabled={disabled}
        aria-label={t(isHidden ? 'menus.showItem' : 'menus.hideItem', { name: label })}
        className={cx(
          'text-xs px-2 py-1 rounded disabled:opacity-50',
          isHidden ? 'bg-line text-fg-muted' : 'bg-success/10 text-success',
          focusRingClasses,
        )}
      >
        {isHidden ? t('menus.hidden') : t('menus.visible')}
      </button>
      {onRemove && (
        <IconButton
          icon="close"
          variant="danger"
          label={t('menus.removeItem', { name: label })}
          onClick={onRemove}
          disabled={disabled}
        />
      )}
    </li>
  );
}
