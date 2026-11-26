import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BackHomeLinkProps {
  /** Where the link goes: the public home page unless an area names its own start page. */
  to?: string;
  label?: string;
}

/** Way out of an error screen, to the public home page by default. */
export default function BackHomeLink({ to = '/', label }: BackHomeLinkProps) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="text-accent hover:text-accent-soft underline underline-offset-4">
      {label ?? t('public.backHome')}
    </Link>
  );
}
