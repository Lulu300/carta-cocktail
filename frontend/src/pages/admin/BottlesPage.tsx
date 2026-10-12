import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import { bottles as bottlesApi } from '../../services/api';
import type { Bottle } from '../../types';
import { qk } from '../../queries/keys';
import { useBottles } from '../../queries/bottles';
import { useCategories } from '../../queries/categories';
import { useCrudMutations, useInvalidateQueries } from '../../queries/crud';
import { groupBottles, isGroup, type BottleGroup } from '../../utils/bottleGrouping';
import Button from '../../components/ui/Button';
import CategoryFilterInput from '../../components/ui/CategoryFilterInput';
import LocationAutocomplete from '../../components/ui/LocationAutocomplete';
import SearchInput from '../../components/ui/SearchInput';
import ImportBottlesWizard from '../../components/import/ImportBottlesWizard';
import DataTable, { type Column } from '../../components/admin/DataTable';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import { useEntityForm } from '../../components/admin/useEntityForm';
import BottleFormModal from '../../components/admin/bottles/BottleFormModal';
import BottleGroupRow from '../../components/admin/bottles/BottleGroupRow';
import BottleHistoryTable from '../../components/admin/bottles/BottleHistoryTable';
import BottleRow from '../../components/admin/bottles/BottleRow';
import ExportMenu from '../../components/admin/bottles/ExportMenu';
import { toBottleForm, type BottleInput } from '../../components/admin/bottles/bottleForm';
import { useBottleFilters, type ListedBottle } from '../../components/admin/bottles/useBottleFilters';

// Stock levels feed the shortages and the cocktail availability; the apéritif and
// digestif flags fill the system menus; categories count their bottles.
const BOTTLE_DEPENDENT_KEYS = [qk.shortages, qk.categories, qk.menus, qk.availability];
// An import may also create categories, and so change how many use each type.
const IMPORT_KEYS = [qk.bottles, ...BOTTLE_DEPENDENT_KEYS, qk.categoryTypes];

type BottleListItem = ListedBottle | BottleGroup<ListedBottle>;

export default function BottlesPage() {
  const { t } = useTranslation();
  const confirmDelete = useConfirmDelete();
  const invalidateQueries = useInvalidateQueries();
  const bottlesQuery = useBottles();
  const categories = useCategories().data ?? [];
  const { create, update, remove } = useCrudMutations<BottleInput>({
    key: qk.bottles,
    api: bottlesApi,
    invalidates: BOTTLE_DEPENDENT_KEYS,
    messages: { created: 'bottles.created', updated: 'bottles.updated', deleted: 'bottles.deleted' },
  });
  const bottleForm = useEntityForm((bottle?: Bottle) => toBottleForm(categories, bottle));
  const filters = useBottleFilters(bottlesQuery.data);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

  const sort = useSort<ListedBottle>(filters.activeBottles);
  const groupedBottles = useMemo(() => groupBottles(sort.sortedItems), [sort.sortedItems]);
  const pagination = usePagination(groupedBottles);

  const handleSubmit = (data: BottleInput, duplicate: boolean) => {
    if (bottleForm.editing) {
      update.mutate({ id: bottleForm.editing.id, data }, { onSuccess: bottleForm.close });
      return;
    }
    // "Save and duplicate" keeps the values for the next bottle, one at a time.
    const onSuccess = duplicate ? () => bottleForm.setField('quantity', 1) : bottleForm.close;
    create.mutate(data, { onSuccess });
  };

  const handleDelete = async (bottle: Bottle) => {
    if (await confirmDelete(t('bottles.confirmDelete'))) remove.mutate(bottle.id);
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const rowActions = { onEdit: bottleForm.open, onDelete: handleDelete };

  const renderRow = (item: BottleListItem) => (isGroup(item)
    ? <BottleGroupRow group={item} expanded={expandedGroups.has(item.key)} onToggle={toggleGroup} {...rowActions} />
    : <BottleRow bottle={item} {...rowActions} />);

  const columns: Column<BottleListItem>[] = [
    { key: 'name', header: t('bottles.name'), sortable: true },
    { key: 'categoryName', header: t('bottles.category'), sortable: true },
    { key: 'capacityMl', header: t('bottles.capacityMl'), sortable: true },
    { key: 'remainingPercent', header: t('bottles.remainingPercent'), sortable: true },
    { key: 'alcoholPercentage', header: t('bottles.alcoholPercentage'), sortable: true },
    { key: 'openedAt', header: t('bottles.openedAt'), sortable: true },
    { key: 'purchasePrice', header: t('bottles.purchasePrice'), sortable: true },
    { key: 'actions', header: t('common.actions'), align: 'right' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold font-serif text-accent">{t('bottles.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImportWizard(true)}>{t('bottles.import')}</Button>
          <ExportMenu filters={filters.exportFilters} />
          <Button
            onClick={() => bottleForm.open()}
            disabled={categories.length === 0}
            title={categories.length === 0 ? t('bottles.noCategoryHint') : undefined}
          >
            {t('bottles.add')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <SearchInput value={filters.search} onChange={filters.setSearch} label={t('bottles.search')} className="lg:w-64" />
        <CategoryFilterInput
          categories={categories}
          value={filters.categoryText}
          selectedId={filters.categoryId}
          onChange={filters.setCategory}
          label={t('bottles.filterByCategory')}
          placeholder={t('bottles.filterByCategory')}
          className="lg:w-64"
        />
        <LocationAutocomplete
          value={filters.location}
          onChange={filters.setLocation}
          locations={filters.locations}
          label={t('bottles.filterByLocation')}
          placeholder={t('bottles.filterByLocation')}
          className="lg:w-64"
        />
      </div>

      <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
        {t('bottles.activeTitle')} ({filters.activeBottles.length})
      </h2>
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        getRowKey={(item) => (isGroup(item) ? item.key : item.id)}
        renderRow={renderRow}
        sort={sort}
        pagination={pagination}
        isLoading={bottlesQuery.isPending}
        isError={bottlesQuery.isError}
        onRetry={() => bottlesQuery.refetch()}
        emptyLabel={t('common.noResults')}
        isFiltered={filters.isFiltered}
      />
      <BottleHistoryTable bottles={filters.emptyBottles} {...rowActions} />

      <BottleFormModal
        entityForm={bottleForm}
        categories={categories}
        isSaving={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />
      {showImportWizard && (
        <ImportBottlesWizard
          onClose={() => setShowImportWizard(false)}
          onImported={() => invalidateQueries(IMPORT_KEYS)}
        />
      )}
    </div>
  );
}
