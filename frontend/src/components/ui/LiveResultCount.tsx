import { useTranslation } from 'react-i18next';

interface LiveResultCountProps {
  /** Number of items left by the filters; null while the list is loading or failed. */
  count: number | null;
}

/**
 * Tells screen reader users how many items a filtered list shows, each time it
 * changes. The region stays mounted, empty while there is no count, so that
 * every new count is announced.
 */
export default function LiveResultCount({ count }: LiveResultCountProps) {
  const { t } = useTranslation();
  return (
    <p className="sr-only" aria-live="polite">
      {count === null ? '' : t('common.resultCount', { count })}
    </p>
  );
}
