import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { CategoryType } from '../../../types';
import { CATEGORY_TYPE_COLORS, getDotClasses } from '../../../utils/colors';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import IconButton from '../../ui/IconButton';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import { cx } from '../../ui/classNames';
import TranslationFields from '../TranslationFields';
import { useConfirmDelete } from '../useConfirmDelete';
import { useCategoryTypeForm } from './useCategoryTypeForm';

interface CategoryTypesManagerProps {
  open: boolean;
  onClose: () => void;
  categoryTypes: CategoryType[];
}

function categoryCount(categoryType: CategoryType): number {
  return categoryType._count?.categories ?? 0;
}

/** Modal listing the category types, with a form to add one or edit the one picked. */
export default function CategoryTypesManager({ open, onClose, categoryTypes }: CategoryTypesManagerProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t('categoryTypes.title')} size="lg">
      {/* Mounted with the modal content: the form starts empty on every opening. */}
      <CategoryTypesPanel categoryTypes={categoryTypes} />
    </Modal>
  );
}

function CategoryTypesPanel({ categoryTypes }: { categoryTypes: CategoryType[] }) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const confirmDelete = useConfirmDelete();
  const typeForm = useCategoryTypeForm();
  const { form, setField, editing } = typeForm;

  const handleDelete = async (name: string) => {
    if (await confirmDelete(t('categoryTypes.confirmDelete'))) typeForm.remove(name);
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {categoryTypes.map((categoryType) => {
          const isUsed = categoryCount(categoryType) > 0;
          return (
            <li key={categoryType.name} className="flex items-center justify-between bg-canvas rounded-lg px-4 py-2">
              <div className="flex items-center gap-3">
                <div className={cx('w-4 h-4 rounded-full', getDotClasses(categoryType.color))} />
                <span className="font-medium">{localize(categoryType)}</span>
                <span className="text-xs text-fg-muted">{categoryType.name}</span>
                <span className="text-xs text-fg-muted">({categoryCount(categoryType)})</span>
              </div>
              <div className="flex items-center gap-1">
                <IconButton icon="edit" label={t('common.edit')} onClick={() => typeForm.open(categoryType)} />
                <IconButton
                  icon="delete"
                  variant="danger"
                  label={isUsed ? t('categoryTypes.cannotDelete') : t('common.delete')}
                  disabled={isUsed}
                  onClick={() => handleDelete(categoryType.name)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <form key={typeForm.formKey} onSubmit={typeForm.submit} className="border-t border-line-strong pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-fg-muted">{editing ? t('categoryTypes.edit') : t('categoryTypes.add')}</h3>
        <Field label={t('categoryTypes.name')} required={!editing}>
          <Input
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            disabled={Boolean(editing)}
            placeholder="GARNISH, MIXER..."
            className="uppercase"
          />
        </Field>
        <fieldset>
          <legend className="block text-sm text-fg-muted mb-1">{t('categoryTypes.color')}</legend>
          <div className="flex gap-2 flex-wrap">
            {CATEGORY_TYPE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setField('color', color)}
                className={cx(
                  'w-8 h-8 rounded-full transition-all',
                  getDotClasses(color),
                  form.color === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface scale-110' : 'opacity-60 hover:opacity-100',
                )}
              />
            ))}
          </div>
        </fieldset>
        <TranslationFields
          value={form.translations}
          onChange={(translations) => setField('translations', translations)}
          placeholder={form.name}
          defaultOpen={Boolean(editing)}
        />
        <div className="flex justify-end gap-3">
          {editing && <Button variant="ghost" onClick={typeForm.resetForm}>{t('common.cancel')}</Button>}
          <Button type="submit" loading={typeForm.isSaving}>{editing ? t('common.save') : t('common.create')}</Button>
        </div>
      </form>
    </div>
  );
}
