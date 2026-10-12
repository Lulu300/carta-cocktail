import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Cocktail } from '../../../types';
import ExportCocktailButton from '../../ui/ExportCocktailButton';
import Icon from '../../ui/Icon';
import IconButton from '../../ui/IconButton';
import { cx, focusRingClasses } from '../../ui/classNames';

interface CocktailActionsProps {
  cocktail: Cocktail;
  onDelete: (cocktail: Cocktail) => void;
  className?: string;
}

/** Edit, export and delete buttons of a cocktail in the admin list. */
export default function CocktailActions({ cocktail, onDelete, className }: CocktailActionsProps) {
  const { t } = useTranslation();

  return (
    <div className={cx('flex items-center gap-3', className)}>
      <Link
        to={`/admin/cocktails/${cocktail.id}`}
        aria-label={t('common.edit')}
        title={t('common.edit')}
        className={cx('text-accent hover:text-accent-soft transition-colors p-1 rounded-lg', focusRingClasses)}
      >
        <Icon name="edit" />
      </Link>
      <ExportCocktailButton cocktailId={cocktail.id} cocktailName={cocktail.name} />
      <IconButton icon="delete" label={t('common.delete')} variant="danger" onClick={() => onDelete(cocktail)} />
    </div>
  );
}
