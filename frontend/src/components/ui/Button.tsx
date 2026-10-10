import type { ComponentPropsWithRef } from 'react';
import { cx, focusRingClasses } from './classNames';
import Spinner from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a spinner while an action is pending. */
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent hover:bg-accent-hover text-on-accent font-semibold',
  secondary: 'border border-accent/30 text-accent hover:bg-accent/10 font-semibold',
  ghost: 'text-fg-muted hover:text-fg',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 font-semibold',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        focusRingClasses,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
