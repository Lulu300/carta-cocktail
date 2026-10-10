import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';

/** Loading placeholder; the caller sets its shape and size through `className`. */
export default function Skeleton({ className, ...rest }: Omit<ComponentPropsWithRef<'div'>, 'children'>) {
  return (
    <div
      aria-hidden="true"
      className={cx('rounded-lg bg-line animate-pulse motion-reduce:animate-none', className)}
      {...rest}
    />
  );
}
