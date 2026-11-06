import { useTranslation } from 'react-i18next';
import { cx, focusRingClasses } from '../../ui/classNames';

interface ReorderButtonsProps {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  /** Name of the item, for the buttons' accessible names. */
  label: string;
}

const BUTTON_CLASSES = cx(
  'px-1 text-xs leading-none text-fg-muted hover:text-fg rounded disabled:opacity-30 disabled:cursor-not-allowed',
  focusRingClasses,
);

/** ▲ / ▼ buttons that move an item one place up or down. */
export default function ReorderButtons({ onUp, onDown, disableUp, disableDown, label }: ReorderButtonsProps) {
  const { t } = useTranslation();
  const upLabel = t('menus.moveUp', { name: label });
  const downLabel = t('menus.moveDown', { name: label });

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={onUp} disabled={disableUp} aria-label={upLabel} title={upLabel} className={BUTTON_CLASSES}>
        ▲
      </button>
      <button type="button" onClick={onDown} disabled={disableDown} aria-label={downLabel} title={downLabel} className={BUTTON_CLASSES}>
        ▼
      </button>
    </div>
  );
}
