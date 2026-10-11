import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PublicLoadingProps {
  className?: string;
  /** Skeleton of the page: hidden from screen readers, which hear "Loading" instead. */
  children: ReactNode;
}

/** Wraps a page skeleton so assistive technologies announce the loading state. */
export default function PublicLoading({ className, children }: PublicLoadingProps) {
  const { t } = useTranslation();

  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t('common.loading')}</span>
      {children}
    </div>
  );
}
