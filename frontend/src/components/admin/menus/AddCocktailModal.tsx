import { useTranslation } from 'react-i18next';
import type { Cocktail } from '../../../types';
import { useCocktails } from '../../../queries/cocktails';
import Badge from '../../ui/Badge';
import Modal from '../../ui/Modal';
import Spinner from '../../ui/Spinner';
import { cx, focusRingClasses } from '../../ui/classNames';
import LoadError from '../LoadError';

interface AddCocktailModalProps {
  open: boolean;
  onClose: () => void;
  /** Cocktails already in the menu, left out of the list. */
  excludedIds: number[];
  onAdd: (cocktail: Cocktail) => void;
}

/** Lists the cocktails that are not in the menu yet; a click adds one. */
export default function AddCocktailModal({ open, onClose, excludedIds, onAdd }: AddCocktailModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t('menus.addCocktail')}>
      <CocktailChoices excludedIds={excludedIds} onAdd={onAdd} />
    </Modal>
  );
}

/** Mounted with the modal content: the cocktails load on the first opening only. */
function CocktailChoices({ excludedIds, onAdd }: Pick<AddCocktailModalProps, 'excludedIds' | 'onAdd'>) {
  const { t } = useTranslation();
  const cocktailsQuery = useCocktails();

  if (cocktailsQuery.isPending) return <div className="flex justify-center py-4"><Spinner /></div>;
  if (cocktailsQuery.isError) return <LoadError onRetry={() => cocktailsQuery.refetch()} />;

  const choices = cocktailsQuery.data.filter((cocktail) => !excludedIds.includes(cocktail.id));
  if (choices.length === 0) return <p className="text-center py-4 text-fg-muted">{t('common.noResults')}</p>;

  return (
    <ul className="max-h-64 overflow-y-auto space-y-2">
      {choices.map((cocktail) => (
        <li key={cocktail.id}>
          <button
            type="button"
            onClick={() => onAdd(cocktail)}
            className={cx('w-full text-left px-4 py-3 rounded-lg bg-canvas hover:bg-line flex items-center justify-between', focusRingClasses)}
          >
            <span>{cocktail.name}</span>
            {!cocktail.isAvailable && <Badge tone="danger">{t('cocktails.unavailable')}</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}
