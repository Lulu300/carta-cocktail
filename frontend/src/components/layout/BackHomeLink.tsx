import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** Way out of a full-screen error, to the public home page. */
export default function BackHomeLink() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="text-accent hover:text-accent-soft underline underline-offset-4">
      {t('public.backHome')}
    </Link>
  );
}
