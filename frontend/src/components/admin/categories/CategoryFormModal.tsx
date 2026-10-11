import { useId, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Category, CategoryType } from '../../../types';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import TranslationFields from '../TranslationFields';
import type { EntityForm } from '../useEntityForm';
import { OTHER_TYPE, toCategoryInput, type CategoryForm, type CategoryInput } from './categoryForm';

interface CategoryFormModalProps {
  entityForm: EntityForm<Category, CategoryForm>;
  categoryTypes: CategoryType[];
  isSaving: boolean;
  onSubmit: (data: CategoryInput) => void;
}

export default function CategoryFormModal({ entityForm, categoryTypes, isSaving, onSubmit }: CategoryFormModalProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { form, setField, editing } = entityForm;
  const thresholdId = useId();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = toCategoryInput(form);
    if (data) onSubmit(data);
  };

  const handleTypeChange = (type: string) => {
    setField('type', type);
    setField('customType', '');
  };

  return (
    <Modal
      open={entityForm.isOpen}
      onClose={entityForm.close}
      title={editing ? t('categories.edit') : t('categories.add')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('categories.name')} required>
          <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
        </Field>
        <TranslationFields
          value={form.translations}
          onChange={(translations) => setField('translations', translations)}
          placeholder={form.name}
        />
        <Field label={t('categories.type')}>
          <Select value={form.type} onChange={(event) => handleTypeChange(event.target.value)}>
            {categoryTypes.map((categoryType) => (
              <option key={categoryType.name} value={categoryType.name}>{localize(categoryType)}</option>
            ))}
            <option value={OTHER_TYPE}>{t('categories.otherType')}</option>
          </Select>
        </Field>
        {form.type === OTHER_TYPE && (
          <Field label={t('categories.customType')} required>
            <Input
              value={form.customType}
              onChange={(event) => setField('customType', event.target.value)}
              placeholder={t('categories.customType')}
            />
          </Field>
        )}
        <Field label={t('categories.desiredStock')}>
          <Input
            type="number"
            min="0"
            value={form.desiredStock}
            onChange={(event) => setField('desiredStock', parseInt(event.target.value) || 0)}
          />
        </Field>
        <div>
          <label htmlFor={thresholdId} className="block text-sm text-fg-muted mb-1">
            {t('categories.minimumPercent')}: {form.minimumPercent}%
          </label>
          <input
            id={thresholdId}
            type="range"
            min="0"
            max="100"
            value={form.minimumPercent}
            onChange={(event) => setField('minimumPercent', parseInt(event.target.value))}
            className="w-full accent-accent"
          />
          <p className="text-xs text-fg-muted mt-1">{t('shortages.threshold')}</p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={entityForm.close}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
