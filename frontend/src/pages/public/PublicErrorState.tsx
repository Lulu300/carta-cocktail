import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { isNotFoundError } from '../../queries/public';
import NotFoundState from './NotFoundState';

interface PublicErrorStateProps {
  error: Error;
  /** Shown for any error but a 404: network failure, server error… */
  loadErrorTitle: string;
  /** Shown for a 404, with a link elsewhere since retrying cannot help. */
  notFound?: ComponentProps<typeof NotFoundState>;
  onRetry: () => void;
  isRetrying: boolean;
}

const ERROR_CLASSES = 'min-h-[60vh] justify-center';

/**
 * Tells "this page does not exist" apart from "this page could not be loaded".
 * Both replace the loading status, so they are announced as an alert, the title alone: the retry button stays out of it.
 */
export default function PublicErrorState({
  error,
  loadErrorTitle,
  notFound,
  onRetry,
  isRetrying,
}: PublicErrorStateProps) {
  const { t } = useTranslation();
  const { retryFailedLoad } = useSiteSettings();

  if (notFound && isNotFoundError(error)) {
    return <NotFoundState {...notFound} />;
  }

  // What made the page fail (rate limit, network) often made the site settings fail too:
  // the retry also brings back the bar's name and icon.
  const retry = () => {
    retryFailedLoad();
    onRetry();
  };

  return (
    <EmptyState
      icon="⚠️"
      title={loadErrorTitle}
      description={t('public.loadErrorHint')}
      titleProps={{ role: 'alert' }}
      className={ERROR_CLASSES}
      action={
        <Button variant="secondary" loading={isRetrying} onClick={retry}>
          {t('common.retry')}
        </Button>
      }
    />
  );
}
