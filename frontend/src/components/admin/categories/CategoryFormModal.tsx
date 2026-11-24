import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, CategoryType } from '../../../types';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import TranslationFields from '../TranslationFields';
import type { EntityForm } from '../useEntityForm';
import { OTHER_TYPE, toCategoryInput, type CategoryForm, type CategoryInput } from './categoryForm';
import { useCategoryTypeName } from './useCategoryTypeName';

interface CategoryFormModalProps {
  entityForm: EntityForm<Category, CategoryForm>;
  categoryTypes: CategoryType[];
  isSaving: boolean;
  onSubmit: (data: CategoryInput) => void;
}

export default function CategoryFormModal({ entityForm, categoryTypes, isSaving, onSubmit }: CategoryFormModalProps) {
  const { t } = useTranslation();
  const { typeLabel } = useCategoryTypeName();
  const { form, setField, editing } = entityForm;
  const thresholdId = useId();
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const customTypeRef = useRef<HTMLInputElement>(null);
  // A type with an empty name (data older than v1.9.0) or a blank custom type cannot be saved.
  const [isTypeMissing, setIsTypeMissing] = useState(false);
  const isCustomType = form.type === OTHER_TYPE;
  const typeError = isTypeMissing ? t('categories.typeRequired') : undefined;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const data = toCategoryInput(form);
    if (data) {
      onSubmit(data);
      return;
    }
    setIsTypeMissing(true);
    (isCustomType ? customTypeRef : typeSelectRef).current?.focus();
  };

  const handleTypeChange = (type: string) => {
    setField('type', type);
    setField('customType', '');
    setIsTypeMissing(false);
  };

  const handleCustomTypeChange = (customType: string) => {
    setField('customType', customType);
    setIsTypeMissing(false);
  };

  const handleClose = () => {
    setIsTypeMissing(false);
    entityForm.close();
  };

  return (
    <Modal
      open={entityForm.isOpen}
      onClose={handleClose}
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
        <Field label={t('categories.type')} error={isCustomType ? undefined : typeError}>
          <Select ref={typeSelectRef} value={form.type} onChange={(event) => handleTypeChange(event.target.value)}>
            {categoryTypes.map((categoryType) => (
              <option key={categoryType.name} value={categoryType.name}>{typeLabel(categoryType)}</option>
            ))}
            <option value={OTHER_TYPE}>{t('categories.otherType')}</option>
          </Select>
        </Field>
        {isCustomType && (
          <Field label={t('categories.customType')} required error={typeError}>
            <Input
              ref={customTypeRef}
              value={form.customType}
              onChange={(event) => handleCustomTypeChange(event.target.value)}
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
          <Button variant="ghost" onClick={handleClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
