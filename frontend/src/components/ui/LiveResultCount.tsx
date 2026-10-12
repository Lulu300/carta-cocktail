import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Pause after the last change before announcing, so typing a search is not read out key by key. */
const ANNOUNCE_DELAY_MS = 500;

interface LiveResultCountProps {
  /**
   * Number of items left by the filters; null when no filter is active (nothing
   * to announce) and while the list is loading or failed.
   */
  count: number | null;
}

/**
 * Tells screen reader users how many items a filtered list shows, each time it
 * changes. The region stays mounted, empty while there is no count, so that
 * every new count is announced.
 */
export default function LiveResultCount({ count }: LiveResultCountProps) {
  const { t } = useTranslation();
  const message = count === null ? '' : t('common.resultCount', { count });
  const [announcedMessage, setAnnouncedMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedMessage(message), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return <p className="sr-only" aria-live="polite">{announcedMessage}</p>;
}
