import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import { categories as categoriesApi } from '../../services/api';
import type { Category } from '../../types';
import { qk } from '../../queries/keys';
import { useCategories } from '../../queries/categories';
import { useCategoryTypes } from '../../queries/categoryTypes';
import { useCrudMutations } from '../../queries/crud';
import { getBadgeClasses } from '../../utils/colors';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import SearchInput from '../../components/ui/SearchInput';
import { cx } from '../../components/ui/classNames';
import DataTable, { type Column } from '../../components/admin/DataTable';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import { useEntityForm } from '../../components/admin/useEntityForm';
import CategoryFormModal from '../../components/admin/categories/CategoryFormModal';
import CategoryTypesManager from '../../components/admin/categories/CategoryTypesManager';
import { toCategoryForm, type CategoryInput } from '../../components/admin/categories/categoryForm';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const confirmDelete = useConfirmDelete();
  const categoriesQuery = useCategories();
  const categoryTypes = useCategoryTypes().data ?? [];
  // Bottles, shortages and availability all depend on the category of a bottle.
  const { create, update, remove } = useCrudMutations<CategoryInput>({
    key: qk.categories,
    api: categoriesApi,
    invalidates: [qk.categoryTypes, qk.bottles, qk.shortages, qk.availability],
    messages: { created: 'categories.created', updated: 'categories.updated', deleted: 'categories.deleted' },
  });
  const categoryForm = useEntityForm((category?: Category) => toCategoryForm(categoryTypes, category));
  const [showTypesManager, setShowTypesManager] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (categoriesQuery.data ?? []).filter((category) => localize(category).toLowerCase().includes(query));
  }, [categoriesQuery.data, search, localize]);

  const sort = useSort<Category>(filteredCategories);
  const pagination = usePagination(sort.sortedItems);

  const typeLabel = (type: string) => {
    const categoryType = categoryTypes.find((candidate) => candidate.name === type);
    return categoryType ? localize(categoryType) : type;
  };

  const handleSubmit = (data: CategoryInput) => {
    const options = { onSuccess: categoryForm.close };
    if (categoryForm.editing) update.mutate({ id: categoryForm.editing.id, data }, options);
    else create.mutate(data, options);
  };

  const handleDelete = async (category: Category) => {
    if (await confirmDelete(t('categories.confirmDelete'))) remove.mutate(category.id);
  };

  const columns: Column<Category>[] = [
    { key: 'name', header: t('categories.name'), sortable: true, className: 'font-medium', render: (category) => localize(category) },
    {
      key: 'type',
      header: t('categories.type'),
      sortable: true,
      render: (category) => (
        <span className={cx('px-2 py-1 rounded text-xs font-medium', getBadgeClasses(category.categoryType?.color))}>
          {typeLabel(category.type)}
        </span>
      ),
    },
    { key: 'desiredStock', header: t('categories.desiredStock'), sortable: true, render: (category) => category.desiredStock },
    { key: 'minimumPercent', header: t('categories.minimumPercent'), sortable: true, render: (category) => `${category.minimumPercent}%` },
    { key: '_count.bottles', header: t('categories.bottleCount'), sortable: true, render: (category) => category._count?.bottles ?? 0 },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'right',
      render: (category) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon="edit" label={t('common.edit')} onClick={() => categoryForm.open(category)} />
          <IconButton icon="delete" label={t('common.delete')} variant="danger" onClick={() => handleDelete(category)} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold font-serif text-accent">{t('categories.title')}</h1>
          <Button variant="ghost" size="sm" onClick={() => setShowTypesManager(true)} className="border border-line-strong">
            {t('categoryTypes.manage')}
          </Button>
        </div>
        <Button onClick={() => categoryForm.open()}>{t('categories.add')}</Button>
      </div>
      <SearchInput value={search} onChange={setSearch} label={t('categories.search')} className="max-w-sm mb-4" />
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        getRowKey={(category) => category.id}
        sort={sort}
        pagination={pagination}
        isLoading={categoriesQuery.isPending}
        isError={categoriesQuery.isError}
        onRetry={() => categoriesQuery.refetch()}
        emptyLabel={t('common.noResults')}
      />
      <CategoryFormModal
        entityForm={categoryForm}
        categoryTypes={categoryTypes}
        isSaving={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />
      <CategoryTypesManager
        open={showTypesManager}
        onClose={() => setShowTypesManager(false)}
        categoryTypes={categoryTypes}
      />
    </div>
  );
}
