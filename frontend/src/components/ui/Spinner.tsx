import type { ComponentPropsWithRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './classNames';

interface SpinnerProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** Text announced to screen readers; defaults to the generic "loading" label. */
  label?: string;
}

export default function Spinner({ label, className, ...rest }: SpinnerProps) {
  const { t } = useTranslation();

  return (
    <span role="status" className={cx('inline-flex items-center', className)} {...rest}>
      <svg
        aria-hidden="true"
        className="size-4 animate-spin motion-reduce:animate-none"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
  );
}
