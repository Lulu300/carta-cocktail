import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { isUpdateAvailable, subscribeToUpdate } from '../../pwa/updateAvailable';
import Alert from '../ui/Alert';
import Button from '../ui/Button';

/**
 * Offers the new version on the admin side, where it does not reload by itself: the admin
 * reloads once nothing is left unsaved.
 */
export default function UpdateAvailableBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const available = useSyncExternalStore(subscribeToUpdate, isUpdateAvailable);
  if (!available) return null;
  return (
    <Alert tone="info" size="md" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{t('appUpdate.available')}</p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          {t('errors.reload')}
        </Button>
      </div>
    </Alert>
  );
}
