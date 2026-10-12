import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import type { Cocktail } from '../../types';
import ImportCocktailWizard from '../../components/import/ImportCocktailWizard';
import { exportCocktailsAsZip } from '../../services/exportZip';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import MultiSelectDropdown from '../../components/ui/MultiSelectDropdown';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { toast } from '../../components/ui/ToastStore';
import LoadError from '../../components/admin/LoadError';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import CocktailCard from '../../components/admin/cocktails/CocktailCard';
import CocktailListItem from '../../components/admin/cocktails/CocktailListItem';
import ViewModeToggle, { type ViewMode } from '../../components/admin/cocktails/ViewModeToggle';
import { useCocktailFilters } from '../../components/admin/cocktails/useCocktailFilters';
import { useSelection } from '../../components/admin/cocktails/useSelection';
import { useCocktails, useCocktailsAvailability, useDeleteCocktail } from '../../queries/cocktails';
import { useInvalidateQueries } from '../../queries/crud';
import { qk } from '../../queries/keys';

// An import may create units, categories, bottles and ingredients, which the other
// admin pages and the sidebar shortage badge read from the query cache.
const IMPORT_KEYS = [
  qk.cocktails,
  qk.availability,
  qk.units,
  qk.categories,
  qk.categoryTypes,
  qk.bottles,
  qk.ingredients,
  qk.shortages,
];

export default function CocktailsPage() {
  const { t } = useTranslation();
  const invalidateQueries = useInvalidateQueries();
  const confirmDelete = useConfirmDelete();
  const cocktailsQuery = useCocktails();
  const availabilityQuery = useCocktailsAvailability();
  const remove = useDeleteCocktail();
  const selection = useSelection<number>();
  const [showImport, setShowImport] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const cocktails = useMemo(() => cocktailsQuery.data ?? [], [cocktailsQuery.data]);
  const filters = useCocktailFilters(cocktails);
  const { filteredCocktails } = filters;
  const { sortedItems } = useSort<Cocktail>(filteredCocktails, 'name');
  const pagination = usePagination(sortedItems);

  const filteredIds = filteredCocktails.map((cocktail) => cocktail.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(selection.isSelected);

  const handleDelete = async (cocktail: Cocktail) => {
    if (await confirmDelete(t('cocktails.confirmDelete'))) remove.mutate(cocktail.id);
  };

  // The wizard does not report whether a recipe was imported, so every close refreshes.
  const handleImportClose = () => {
    setShowImport(false);
    invalidateQueries(IMPORT_KEYS);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    selection.clear();
  };

  const handleBatchExport = async () => {
    setIsExporting(true);
    try {
      await exportCocktailsAsZip([...selection.selected]);
      exitSelectionMode();
    } catch (error) {
      toast.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const renderCocktails = () => {
    if (cocktailsQuery.isPending) return <p role="status" className="text-center py-12 text-fg-muted">{t('common.loading')}</p>;
    if (cocktailsQuery.isError) return <LoadError onRetry={() => cocktailsQuery.refetch()} />;
    if (filteredCocktails.length === 0) return <div className="text-center py-12 text-fg-muted">{t('common.noResults')}</div>;

    const Item = viewMode === 'grid' ? CocktailCard : CocktailListItem;
    return (
      <>
        <div
          data-testid={`cocktails-${viewMode}-view`}
          className={viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'bg-surface border border-line rounded-xl overflow-hidden'}
        >
          {pagination.paginatedItems.map((cocktail) => (
            <Item
              key={cocktail.id}
              cocktail={cocktail}
              availability={availabilityQuery.data?.[cocktail.id]}
              availabilityLoading={availabilityQuery.isFetching}
              selectionMode={selectionMode}
              isSelected={selection.isSelected(cocktail.id)}
              onToggle={selection.toggle}
              onDelete={handleDelete}
            />
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
        <h1 className="text-2xl font-bold font-serif text-accent">{t('cocktails.title')}</h1>
        <div className="flex gap-2 items-center">
          {selectionMode ? (
            <>
              <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(event) => selection.setAll(filteredIds, event.target.checked)}
                  className="size-4 rounded bg-canvas border-line-strong accent-accent"
                />
                {t('cocktails.selectAll')}
              </label>
              <Button onClick={handleBatchExport} disabled={selection.selected.size === 0} loading={isExporting}>
                {t('cocktails.exportZip', { count: selection.selected.size })}
              </Button>
              <Button variant="ghost" onClick={exitSelectionMode}>{t('common.cancel')}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setSelectionMode(true)}>
                <Icon name="download" />
                {t('cocktails.batchExport')}
              </Button>
              <Button variant="secondary" onClick={() => setShowImport(true)}>{t('cocktails.import')}</Button>
              <Link
                to="/admin/cocktails/new"
                className="bg-accent hover:bg-accent-hover text-on-accent font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t('cocktails.add')}
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4 lg:items-center">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <SearchInput value={filters.search} onChange={filters.setSearch} className="sm:w-64" />
          <MultiSelectDropdown
            options={filters.tagOptions}
            selected={filters.selectedTags}
            onChange={filters.setSelectedTags}
            placeholder={t('cocktails.filterByTags')}
            className="sm:w-64"
          />
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {availabilityQuery.isError && <LoadError onRetry={() => availabilityQuery.refetch()} />}
      {renderCocktails()}

      {showImport && <ImportCocktailWizard onClose={handleImportClose} />}
    </div>
  );
}
