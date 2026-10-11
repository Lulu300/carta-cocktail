import { useId, useRef, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Bottle, Category } from '../../../types';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import type { EntityForm } from '../useEntityForm';
import { clampQuantity, toBottleInput, type BottleForm, type BottleInput } from './bottleForm';

interface BottleFormModalProps {
  entityForm: EntityForm<Bottle, BottleForm>;
  categories: Category[];
  isSaving: boolean;
  /** `duplicate` asks to keep the form open with the same values, for the next identical bottle. */
  onSubmit: (data: BottleInput, duplicate: boolean) => void;
}

export default function BottleFormModal({ entityForm, categories, isSaving, onSubmit }: BottleFormModalProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { form, setField, editing } = entityForm;
  const remainingId = useId();
  // Lets "save and duplicate" reuse the form submission (and its native validation)
  // while "Save" stays the only submit button, i.e. the one triggered by Enter.
  const submitIntent = useRef<'save' | 'duplicate'>('save');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = editing ? toBottleInput(form) : { ...toBottleInput(form), quantity: form.quantity };
    onSubmit(data, submitIntent.current === 'duplicate');
  };

  const handleSaveAndDuplicate = (event: MouseEvent<HTMLButtonElement>) => {
    submitIntent.current = 'duplicate';
    // requestSubmit() checks required fields and dispatches submit synchronously
    event.currentTarget.form?.requestSubmit();
    submitIntent.current = 'save';
  };

  const categoryLabel = (category: Category) => {
    const typeLabel = category.categoryType ? localize(category.categoryType) : category.type;
    return `${localize(category)} (${typeLabel})`;
  };

  return (
    <Modal
      open={entityForm.isOpen}
      onClose={entityForm.close}
      title={editing ? t('bottles.edit') : t('bottles.add')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('bottles.name')} required>
          <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
        </Field>
        <Field label={t('bottles.category')}>
          <Select value={form.categoryId} onChange={(event) => setField('categoryId', parseInt(event.target.value))}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{categoryLabel(category)}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('bottles.capacityMl')}>
            <Input
              type="number"
              min="1"
              value={form.capacityMl}
              onChange={(event) => setField('capacityMl', parseInt(event.target.value) || 0)}
            />
          </Field>
          <Field label={t('bottles.purchasePrice')}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.purchasePrice}
              onChange={(event) => setField('purchasePrice', event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div>
          <label htmlFor={remainingId} className="block text-sm text-fg-muted mb-1">
            {t('bottles.remainingPercent')}: {form.remainingPercent}%
          </label>
          <input
            id={remainingId}
            type="range"
            min="0"
            max="100"
            value={form.remainingPercent}
            onChange={(event) => setField('remainingPercent', parseInt(event.target.value))}
            className="w-full accent-accent"
          />
        </div>
        <Field label={t('bottles.openedAt')}>
          <Input type="date" value={form.openedAt} onChange={(event) => setField('openedAt', event.target.value)} />
        </Field>
        <Field label="Alcool % (vol.)">
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.alcoholPercentage}
            onChange={(event) => setField('alcoholPercentage', event.target.value)}
            placeholder="Ex: 40"
          />
        </Field>
        <Field label={t('bottles.location')}>
          <Input
            value={form.location}
            onChange={(event) => setField('location', event.target.value)}
            placeholder={t('bottles.locationPlaceholder')}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="block text-sm text-fg-muted mb-2">Utilisation</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isApero}
              onChange={(event) => setField('isApero', event.target.checked)}
              className="size-4 accent-accent"
            />
            <span className="text-sm">Utilisable comme apéritif</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDigestif}
              onChange={(event) => setField('isDigestif', event.target.checked)}
              className="size-4 accent-accent"
            />
            <span className="text-sm">Utilisable comme digestif</span>
          </label>
        </fieldset>
        {!editing && (
          <Field
            label={t('bottles.quantity')}
            hint={form.quantity > 1 ? t('bottles.quantityHint', { count: form.quantity }) : undefined}
          >
            <Input
              type="number"
              min="1"
              max="50"
              value={form.quantity}
              onChange={(event) => setField('quantity', clampQuantity(event.target.value))}
            />
          </Field>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={entityForm.close}>{t('common.cancel')}</Button>
          {!editing && (
            <Button variant="secondary" onClick={handleSaveAndDuplicate} disabled={isSaving}>
              {t('bottles.saveDuplicate')}
            </Button>
          )}
          <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
