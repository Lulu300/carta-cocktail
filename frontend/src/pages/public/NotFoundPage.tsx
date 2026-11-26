import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../../hooks/usePageTitle';
import NotFoundState from './NotFoundState';

/** Shown for an address no route matches. The address stays as requested. */
export default function NotFoundPage() {
  const { t } = useTranslation();
  const title = t('public.pageNotFound');
  usePageTitle(title);
  return <NotFoundState title={title} linkTo="/" linkLabel={t('public.backHome')} />;
}
