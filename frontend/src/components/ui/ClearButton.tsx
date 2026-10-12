import { cx } from './classNames';
import Icon from './Icon';

interface ClearButtonProps {
  /** Accessible name: the cross alone says nothing to a screen reader. */
  label: string;
  onClick: () => void;
  className?: string;
}

/** Cross that empties a text field, placed over the right end of the field. */
export default function ClearButton({ label, onClick, className }: ClearButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        // 32 px hit area around the 16 px cross, above the 24 px minimum of WCAG 2.5.8.
        'absolute top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-muted hover:text-fg transition-colors',
        className,
      )}
    >
      <Icon name="close" className="size-4" />
    </button>
  );
}
