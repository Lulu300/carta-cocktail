import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EmptyState from '../ui/EmptyState';
import { isInFrame } from '../../utils/frame';

/**
 * Keeps the sign-in and the admin out of iframes. nginx refuses to load them in a frame
 * (frame-ancestors 'none'), but an embedded menu can still reach them through a client-side
 * navigation, which loads no new headers: the page then offers to open in the whole tab
 * instead. Its messages ship with the public ones, since the admin chunks are never loaded here.
 */
export default function OutsideFrameOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  if (!isInFrame()) return children;

  return (
    <main className="min-h-screen bg-canvas text-fg flex items-center justify-center">
      <EmptyState
        icon="🔒"
        title={t('frame.adminTitle')}
        description={t('frame.adminDescription')}
        action={
          <a
            href={`${pathname}${search}`}
            target="_top"
            className="text-accent underline underline-offset-2 hover:text-accent-soft"
          >
            {t('frame.openOutside')}
          </a>
        }
      />
    </main>
  );
}
