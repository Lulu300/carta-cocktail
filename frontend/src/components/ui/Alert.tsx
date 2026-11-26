import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';

type AlertTone = 'danger' | 'warning' | 'success' | 'info';
type AlertSize = 'xs' | 'sm' | 'md' | 'banner';

interface AlertProps extends ComponentPropsWithRef<'div'> {
  tone: AlertTone;
  title?: string;
  size?: AlertSize;
}

const TONE_CLASSES: Record<AlertTone, string> = {
  danger: 'bg-danger/10 border-danger/30 text-danger',
  warning: 'bg-warning/10 border-warning/30 text-warning',
  success: 'bg-success/10 border-success/30 text-success',
  info: 'bg-info/10 border-info/30 text-info',
};

// Radius, padding and text size. A banner fills a whole panel: the caller sets its text size.
const SIZE_CLASSES: Record<AlertSize, string> = {
  xs: 'space-y-2 rounded-lg p-3 text-xs',
  sm: 'space-y-2 rounded-lg p-3 text-sm',
  md: 'space-y-2 rounded-lg px-4 py-3 text-sm',
  banner: 'space-y-4 rounded-xl px-6 py-8 text-center',
};

/**
 * A colored message block. Only an error interrupts the reader (`alert`); the other
 * tones are announced politely (`status`).
 */
export default function Alert({
  tone,
  title,
  size = 'sm',
  role,
  className,
  children,
  ...rest
}: AlertProps) {
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cx('border', TONE_CLASSES[tone], SIZE_CLASSES[size], className)}
      {...rest}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}
