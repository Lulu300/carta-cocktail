import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps extends ComponentPropsWithRef<'span'> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-line text-fg-muted',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
};

export default function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('inline-flex items-center px-2 py-1 rounded text-xs font-medium', TONE_CLASSES[tone], className)}
      {...rest}
    />
  );
}
