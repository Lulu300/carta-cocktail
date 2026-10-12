import type { Key } from 'react';
import { cx } from './classNames';
import type { useComboboxKeyboard } from './useComboboxKeyboard';

interface ComboboxListboxProps<T> {
  combobox: ReturnType<typeof useComboboxKeyboard<T>>;
  options: T[];
  getKey: (option: T) => Key;
  getLabel: (option: T) => string;
  onSelect: (option: T) => void;
  className?: string;
}

/** Suggestions of a combobox: the option highlighted from the keyboard looks hovered. */
export default function ComboboxListbox<T>({
  combobox, options, getKey, getLabel, onSelect, className,
}: ComboboxListboxProps<T>) {
  return (
    <ul
      {...combobox.listboxProps}
      className={cx(
        'absolute z-30 mt-1 w-full overflow-y-auto py-1 bg-surface border border-line-strong rounded-lg shadow-lg',
        className,
      )}
    >
      {options.map((option, index) => (
        <li
          key={getKey(option)}
          id={combobox.getOptionId(index)}
          role="option"
          aria-selected={index === combobox.activeIndex}
          onClick={() => onSelect(option)}
          className={cx(
            'px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-line hover:text-fg',
            index === combobox.activeIndex ? 'bg-line text-fg' : 'text-fg-muted',
          )}
        >
          {getLabel(option)}
        </li>
      ))}
    </ul>
  );
}
