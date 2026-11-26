import { Link } from 'react-router-dom';
import EmptyState from '../../components/ui/EmptyState';

interface NotFoundStateProps {
  title: string;
  linkTo: string;
  linkLabel: string;
}

/** "This page does not exist", with a link elsewhere since retrying cannot help. */
export default function NotFoundState({ title, linkTo, linkLabel }: NotFoundStateProps) {
  return (
    <EmptyState
      icon="🍸"
      title={title}
      role="alert"
      className="min-h-[60vh] justify-center"
      action={(
        <Link to={linkTo} className="text-accent hover:text-accent-soft underline underline-offset-4">
          {linkLabel}
        </Link>
      )}
    />
  );
}
