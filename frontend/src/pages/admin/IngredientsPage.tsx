import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import { ingredients as ingredientsApi } from '../../services/api';
import type { Ingredient } from '../../types';
import { qk } from '../../queries/keys';
import { useIngredients } from '../../queries/ingredients';
import { useCrudMutations, useEntityMutation } from '../../queries/crud';
import { buildNameTranslations, toTranslationForm, type TranslationForm } from '../../utils/translations';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import IconButton from '../../components/ui/IconButton';
import IconPicker from '../../components/ui/IconPicker';
import Input from '../../components/ui/Input';
import LiveResultCount from '../../components/ui/LiveResultCount';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import Skeleton from '../../components/ui/Skeleton';
import { cx } from '../../components/ui/classNames';
import LoadError from '../../components/admin/LoadError';
import TranslationFields from '../../components/admin/TranslationFields';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import { useEntityForm } from '../../components/admin/useEntityForm';

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

interface IngredientForm {
  name: string;
  icon: string;
  translations: TranslationForm;
}

interface IngredientInput {
  name: string;
  icon: string | null;
  nameTranslations: Record<string, string> | null;
}

function toIngredientForm(ingredient?: Ingredient): IngredientForm {
  return {
    name: ingredient?.name ?? '',
    icon: ingredient?.icon ?? '',
    translations: toTranslationForm(ingredient?.nameTranslations),
  };
}

function toIngredientInput(form: IngredientForm): IngredientInput {
  return {
    name: form.name,
    icon: form.icon || null,
    nameTranslations: buildNameTranslations(form.translations),
  };
}

function matchesAvailability(ingredient: Ingredient, filter: AvailabilityFilter): boolean {
  if (filter === 'available') return ingredient.isAvailable;
  if (filter === 'unavailable') return !ingredient.isAvailable;
  return true;
}

// An ingredient's availability decides whether the cocktails using it can be made.
const REFRESHED_KEYS = [qk.ingredients, qk.availability];
const SKELETON_CARDS = 10;

export default function IngredientsPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const confirmDelete = useConfirmDelete();
  const ingredientsQuery = useIngredients();
  const ingredients = ingredientsQuery.data;
  const { create, update, remove } = useCrudMutations<IngredientInput>({
    key: qk.ingredients,
    api: ingredientsApi,
    invalidates: [qk.availability],
    messages: { created: 'ingredients.created', updated: 'ingredients.updated', deleted: 'ingredients.deleted' },
  });
  const toggleAvailability = useEntityMutation<Ingredient>({
    mutationFn: (ingredient) => ingredientsApi.update(ingredient.id, { isAvailable: !ingredient.isAvailable }),
    invalidates: REFRESHED_KEYS,
  });
  const setAllAvailability = useEntityMutation<boolean>({
    mutationFn: (available) => ingredientsApi.bulkAvailability({ available }),
    invalidates: REFRESHED_KEYS,
  });
  const ingredientForm = useEntityForm(toIngredientForm);
  const { form, setField, editing } = ingredientForm;
  const [filter, setFilter] = useState<AvailabilityFilter>('all');
  const [search, setSearch] = useState('');
  const isFiltered = filter !== 'all' || search.trim() !== '';

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (ingredients ?? []).filter((ingredient) =>
      matchesAvailability(ingredient, filter) && localize(ingredient).toLowerCase().includes(query),
    );
  }, [ingredients, filter, search, localize]);

  const { sortedItems } = useSort<Ingredient>(filteredIngredients, 'name');
  const pagination = usePagination(sortedItems);
  const isSaving = create.isPending || update.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = toIngredientInput(form);
    const options = { onSuccess: ingredientForm.close };
    if (editing) update.mutate({ id: editing.id, data }, options);
    else create.mutate(data, options);
  };

  const handleDelete = async (ingredient: Ingredient) => {
    if (await confirmDelete(t('ingredients.confirmDelete'))) remove.mutate(ingredient.id);
  };

  const countFor = (status: AvailabilityFilter) =>
    (ingredients ?? []).filter((ingredient) => matchesAvailability(ingredient, status)).length;

  const renderContent = () => {
    if (ingredientsQuery.isPending) {
      return (
        <>
          <p role="status" className="sr-only">{t('common.loading')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}
          </div>
        </>
      );
    }
    if (ingredientsQuery.isError) return <LoadError onRetry={() => ingredientsQuery.refetch()} />;
    if (filteredIngredients.length === 0) {
      return <div className="text-center py-12 text-fg-muted">{t('common.noResults')}</div>;
    }
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {pagination.paginatedItems.map((ingredient) => (
            <div
              key={ingredient.id}
              className={cx(
                'relative bg-surface border rounded-xl p-4 transition-colors',
                ingredient.isAvailable
                  ? 'border-line hover:border-accent/50'
                  : 'border-danger/30 hover:border-danger/70',
              )}
            >
              {/* A switch, so the availability also toggles from the keyboard; its state replaces the status text. */}
              <button
                type="button"
                role="switch"
                aria-checked={ingredient.isAvailable}
                onClick={() => toggleAvailability.mutate(ingredient)}
                className="block w-full rounded-lg cursor-pointer"
              >
                <span aria-hidden="true" className={cx('absolute top-2 right-2 w-3 h-3 rounded-full', ingredient.isAvailable ? 'bg-success' : 'bg-danger')} />
                <span aria-hidden="true" className={cx('text-4xl mb-3 h-12 flex items-center justify-center', !ingredient.isAvailable && 'grayscale opacity-60')}>
                  {ingredient.icon || '📦'}
                </span>
                <span className="block text-center mb-3">
                  <span className="block font-medium text-fg truncate">{localize(ingredient)}</span>
                  <span aria-hidden="true" className="block text-xs text-fg-muted mt-1">
                    {ingredient.isAvailable ? t('cocktails.available') : t('cocktails.unavailable')}
                  </span>
                </span>
              </button>
              <div className="flex justify-center gap-1 pt-2 border-t border-line">
                <IconButton
                  icon="edit"
                  label={t('common.edit')}
                  onClick={() => ingredientForm.open(ingredient)}
                />
                <IconButton
                  icon="delete"
                  label={t('common.delete')}
                  variant="danger"
                  onClick={() => handleDelete(ingredient)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-surface border border-line rounded-xl overflow-hidden">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      </>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-accent">{t('ingredients.title')}</h1>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={() => setAllAvailability.mutate(true)}>
            {t('ingredients.allAvailable')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setAllAvailability.mutate(false)}>
            {t('ingredients.allUnavailable')}
          </Button>
          <Button onClick={() => ingredientForm.open()}>{t('ingredients.add')}</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} label={t('ingredients.search')} className="sm:max-w-sm" />
        <div className="flex gap-2">
          {(['all', 'available', 'unavailable'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              aria-pressed={filter === status}
              className={cx(
                'px-3 py-1.5 rounded-lg text-sm transition-colors border',
                filter === status
                  ? 'bg-accent/10 text-accent border-accent/50'
                  : 'text-fg-muted border-line-strong hover:border-fg-muted',
              )}
            >
              {t(`ingredients.filter.${status}`)}
              {status !== 'all' && <span className="ml-1.5 text-xs">({countFor(status)})</span>}
            </button>
          ))}
        </div>
      </div>

      <LiveResultCount count={ingredientsQuery.isSuccess && isFiltered ? filteredIngredients.length : null} />
      {renderContent()}

      <Modal
        open={ingredientForm.isOpen}
        onClose={ingredientForm.close}
        title={editing ? t('ingredients.edit') : t('ingredients.add')}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('ingredients.name')} required>
            <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
          </Field>
          <TranslationFields
            value={form.translations}
            onChange={(translations) => setField('translations', translations)}
            placeholder={form.name}
          />
          <div>
            <p className="block text-sm text-fg-muted mb-2">Icône (optionnel)</p>
            <IconPicker value={form.icon} onChange={(icon) => setField('icon', icon)} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={ingredientForm.close}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
