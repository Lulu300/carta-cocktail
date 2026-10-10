import type { ComponentPropsWithRef } from 'react';
import { cx, focusRingClasses } from './classNames';

interface ToggleSwitchProps extends Omit<ComponentPropsWithRef<'button'>, 'onChange' | 'onClick' | 'children' | 'role' | 'aria-checked'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Keeps the label for screen readers only, when the context already shows it. */
  hideLabel?: boolean;
}

export default function ToggleSwitch({
  checked, onChange, label, hideLabel = false, className, ...rest
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex items-center gap-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed',
        focusRingClasses,
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx('flex items-center w-12 h-6 rounded-full transition-colors', checked ? 'bg-success' : 'bg-gray-600')}
      >
        <span
          className={cx('size-5 bg-white rounded-full transition-transform', checked ? 'translate-x-6' : 'translate-x-0.5')}
        />
      </span>
      <span className={hideLabel ? 'sr-only' : 'text-sm text-fg'}>{label}</span>
    </button>
  );
}
