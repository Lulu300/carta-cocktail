import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import { units as unitsApi } from '../../services/api';
import type { Unit } from '../../types';
import { qk } from '../../queries/keys';
import { useUnits } from '../../queries/units';
import { useCrudMutations } from '../../queries/crud';
import { buildNameTranslations, toTranslationForm, type TranslationForm } from '../../utils/translations';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import IconButton from '../../components/ui/IconButton';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import DataTable, { type Column } from '../../components/admin/DataTable';
import TranslationFields from '../../components/admin/TranslationFields';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import { useEntityForm } from '../../components/admin/useEntityForm';

interface UnitForm {
  name: string;
  abbreviation: string;
  /** Kept as typed: empty means the unit cannot be converted to ml. */
  conversionFactorToMl: string;
  translations: TranslationForm;
}

interface UnitInput {
  name: string;
  abbreviation: string;
  conversionFactorToMl: number | null;
  nameTranslations: Record<string, string> | null;
}

function toUnitForm(unit?: Unit): UnitForm {
  return {
    name: unit?.name ?? '',
    abbreviation: unit?.abbreviation ?? '',
    conversionFactorToMl: unit?.conversionFactorToMl != null ? String(unit.conversionFactorToMl) : '',
    translations: toTranslationForm(unit?.nameTranslations),
  };
}

function toUnitInput(form: UnitForm): UnitInput {
  return {
    name: form.name,
    abbreviation: form.abbreviation,
    conversionFactorToMl: form.conversionFactorToMl === '' ? null : parseFloat(form.conversionFactorToMl),
    nameTranslations: buildNameTranslations(form.translations),
  };
}

export default function UnitsPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const confirmDelete = useConfirmDelete();
  const unitsQuery = useUnits();
  // A unit's conversion factor decides whether the stock covers a recipe.
  const { create, update, remove } = useCrudMutations<UnitInput>({
    key: qk.units,
    api: unitsApi,
    invalidates: [qk.availability],
    messages: { created: 'units.created', updated: 'units.updated', deleted: 'units.deleted' },
  });
  const unitForm = useEntityForm(toUnitForm);
  const { form, setField, editing } = unitForm;
  const [search, setSearch] = useState('');

  const filteredUnits = useMemo(() => {
    const units = unitsQuery.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return units;
    return units.filter((unit) =>
      localize(unit).toLowerCase().includes(query) || unit.abbreviation.toLowerCase().includes(query),
    );
  }, [unitsQuery.data, search, localize]);

  const sort = useSort<Unit>(filteredUnits);
  const pagination = usePagination(sort.sortedItems);
  const isSaving = create.isPending || update.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = toUnitInput(form);
    const options = { onSuccess: unitForm.close };
    if (editing) update.mutate({ id: editing.id, data }, options);
    else create.mutate(data, options);
  };

  const handleDelete = async (unit: Unit) => {
    if (await confirmDelete(t('units.confirmDelete'))) remove.mutate(unit.id);
  };

  const columns: Column<Unit>[] = [
    { key: 'name', header: t('units.name'), sortable: true, className: 'font-medium', render: (unit) => localize(unit) },
    { key: 'abbreviation', header: t('units.abbreviation'), sortable: true, className: 'text-fg-muted', render: (unit) => unit.abbreviation },
    {
      key: 'conversionFactorToMl',
      header: t('units.conversionFactor'),
      sortable: true,
      className: 'text-fg-muted',
      render: (unit) => (unit.conversionFactorToMl !== null
        ? <span>1 {unit.abbreviation} = {t('units.ml', { value: unit.conversionFactorToMl })}</span>
        : <span className="italic">{t('units.notConvertible')}</span>),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'right',
      render: (unit) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon="edit" label={t('common.edit')} onClick={() => unitForm.open(unit)} />
          <IconButton icon="delete" label={t('common.delete')} variant="danger" onClick={() => handleDelete(unit)} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-accent">{t('units.title')}</h1>
        <Button onClick={() => unitForm.open()}>{t('units.add')}</Button>
      </div>
      <SearchInput value={search} onChange={setSearch} label={t('units.search')} className="max-w-sm mb-4" />
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        getRowKey={(unit) => unit.id}
        sort={sort}
        pagination={pagination}
        isLoading={unitsQuery.isPending}
        isError={unitsQuery.isError}
        onRetry={() => unitsQuery.refetch()}
        emptyLabel={t('common.noResults')}
        isFiltered={search.trim() !== ''}
      />
      <Modal
        open={unitForm.isOpen}
        onClose={unitForm.close}
        title={editing ? t('units.edit') : t('units.add')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('units.name')} required>
            <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
          </Field>
          <TranslationFields
            value={form.translations}
            onChange={(translations) => setField('translations', translations)}
            placeholder={form.name}
          />
          <Field label={t('units.abbreviation')} required>
            <Input value={form.abbreviation} onChange={(event) => setField('abbreviation', event.target.value)} />
          </Field>
          <Field
            label={t('units.conversionFactor')}
            hint={t('units.conversionFactorHint')}
          >
            <Input
              type="number"
              step="any"
              value={form.conversionFactorToMl}
              onChange={(event) => setField('conversionFactorToMl', event.target.value)}
              placeholder={t('units.notConvertible')}
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={unitForm.close}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
