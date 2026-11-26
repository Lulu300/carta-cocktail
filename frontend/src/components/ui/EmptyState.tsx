import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './classNames';

interface EmptyStateProps extends Omit<ComponentPropsWithRef<'div'>, 'title' | 'children'> {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Call to action, e.g. a "Create" or "Retry" button. */
  action?: ReactNode;
  /**
   * Attributes of the title alone, e.g. `role="alert"` or a `ref` to focus it. Put on the
   * container, `role="alert"` would announce the action too.
   */
  titleProps?: ComponentPropsWithRef<'p'>;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  titleProps,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cx('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}
      {...rest}
    >
      {icon && (
        <div aria-hidden="true" className="text-4xl text-fg-muted">
          {icon}
        </div>
      )}
      <p {...titleProps} className={cx('text-lg font-semibold text-fg', titleProps?.className)}>
        {title}
      </p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
