import type { ComponentPropsWithRef } from 'react';
import { cx, focusRingClasses } from './classNames';
import Icon, { type IconName } from './Icon';

type IconButtonVariant = 'default' | 'neutral' | 'danger';

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: IconName;
  /** Required: an icon alone gives no accessible name. Used as aria-label and tooltip. */
  label: string;
  variant?: IconButtonVariant;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: 'text-accent hover:text-accent-soft hover:bg-accent/10',
  // Low-emphasis actions such as closing a modal.
  neutral: 'text-fg-muted hover:text-fg hover:bg-line',
  danger: 'text-danger hover:bg-danger/10',
};

export default function IconButton({
  icon, label, variant = 'default', type = 'button', className, ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        // 40x40 px minimum hit area, even though the icon is 20 px.
        'inline-flex items-center justify-center min-w-10 min-h-10 rounded-lg transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        focusRingClasses,
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
