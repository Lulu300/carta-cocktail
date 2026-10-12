import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBottles } from '../../../queries/bottles';
import { useCategories } from '../../../queries/categories';
import { useCocktail, useCocktailsAvailability } from '../../../queries/cocktails';
import { useIngredients } from '../../../queries/ingredients';
import { isNotFoundError } from '../../../queries/public';
import { useUnits } from '../../../queries/units';
import EmptyState from '../../ui/EmptyState';
import LoadError from '../LoadError';
import CocktailEditor from './CocktailEditor';

function hasFailedWithoutData(query: { isError: boolean; data: unknown }): boolean {
  return query.isError && query.data === undefined;
}

interface CocktailFormProps {
  /** The cocktail to edit, or undefined to create one. */
  id?: number;
}

/**
 * Loads the cocktail and the lists its lines point to, each on its own: a list
 * that reloads never touches the cocktail, nor what the admin is typing.
 */
export default function CocktailForm({ id }: CocktailFormProps) {
  const { t } = useTranslation();
  const isEdit = id !== undefined;
  const cocktailQuery = useCocktail(id);
  const availabilityQuery = useCocktailsAvailability({ enabled: isEdit });
  const categoriesQuery = useCategories();
  const bottlesQuery = useBottles();
  const ingredientsQuery = useIngredients();
  const unitsQuery = useUnits();
  const listQueries = [categoriesQuery, bottlesQuery, ingredientsQuery, unitsQuery];

  // Only a first load that fails replaces the form. A failed background refetch keeps
  // the loaded data in TanStack Query, and the form stays with what the admin typed.
  if (isEdit && hasFailedWithoutData(cocktailQuery)) {
    if (!isNotFoundError(cocktailQuery.error)) return <LoadError onRetry={() => cocktailQuery.refetch()} />;
    return (
      <EmptyState
        icon="🍸"
        role="alert"
        title={t('cocktails.notFound')}
        action={<Link to="/admin/cocktails" className="text-accent hover:text-accent-soft underline underline-offset-4">{t('cocktails.backToList')}</Link>}
      />
    );
  }
  const failedLists = listQueries.filter(hasFailedWithoutData);
  if (failedLists.length > 0) {
    return <LoadError onRetry={() => failedLists.forEach((query) => query.refetch())} />;
  }
  // The selects only show a stored id once their options exist: the form waits for every list.
  if ((isEdit && cocktailQuery.isPending) || listQueries.some((query) => query.isPending)) {
    return <p role="status" className="text-center py-12 text-fg-muted">{t('common.loading')}</p>;
  }

  return (
    <CocktailEditor
      cocktail={cocktailQuery.data}
      availability={isEdit ? availabilityQuery.data?.[id] : undefined}
      lists={{
        categories: categoriesQuery.data ?? [],
        bottles: bottlesQuery.data ?? [],
        ingredients: ingredientsQuery.data ?? [],
        units: unitsQuery.data ?? [],
      }}
    />
  );
}
