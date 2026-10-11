import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { isNotFoundError } from '../../queries/public';

interface NotFoundContent {
  title: string;
  linkTo: string;
  linkLabel: string;
}

interface PublicErrorStateProps {
  error: Error;
  /** Shown for any error but a 404: network failure, server error… */
  loadErrorTitle: string;
  /** Shown for a 404, with a link elsewhere since retrying cannot help. */
  notFound?: NotFoundContent;
  onRetry: () => void;
  isRetrying: boolean;
}

const ERROR_CLASSES = 'min-h-[60vh] justify-center';

/**
 * Tells "this page does not exist" apart from "this page could not be loaded".
 * Both replace the loading status, so they are announced as an alert.
 */
export default function PublicErrorState({ error, loadErrorTitle, notFound, onRetry, isRetrying }: PublicErrorStateProps) {
  const { t } = useTranslation();

  if (notFound && isNotFoundError(error)) {
    return (
      <EmptyState
        icon="🍸"
        title={notFound.title}
        role="alert"
        className={ERROR_CLASSES}
        action={(
          <Link to={notFound.linkTo} className="text-accent hover:text-accent-soft underline underline-offset-4">
            {notFound.linkLabel}
          </Link>
        )}
      />
    );
  }

  return (
    <EmptyState
      icon="⚠️"
      title={loadErrorTitle}
      description={t('public.loadErrorHint')}
      role="alert"
      className={ERROR_CLASSES}
      action={(
        <Button variant="secondary" loading={isRetrying} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    />
  );
}
