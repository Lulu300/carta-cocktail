import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';

/** Shown instead of a list that failed to load, so it never reads as an empty list. */
export default function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-danger">{t('common.error')}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  );
}
