import { cx } from '../../ui/classNames';

interface SelectionCheckboxProps {
  /** Name of the selected item, read out by screen readers. */
  name: string;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}

/** Checkbox of a clickable item: its own click must not reach the item and toggle twice. */
export default function SelectionCheckbox({ name, checked, onToggle, className }: SelectionCheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={name}
      checked={checked}
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      className={cx('size-5 rounded bg-canvas border-line-strong accent-accent cursor-pointer', className)}
    />
  );
}
