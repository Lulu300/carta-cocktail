import type { FormEvent } from 'react';
import { categoryTypes as categoryTypesApi } from '../../../services/api';
import type { CategoryType } from '../../../types';
import { qk } from '../../../queries/keys';
import { useEntityMutation } from '../../../queries/crud';
import { buildNameTranslations, toTranslationForm, type TranslationForm } from '../../../utils/translations';
import { useEntityForm } from '../useEntityForm';

export interface CategoryTypeForm {
  name: string;
  color: string;
  translations: TranslationForm;
}

interface CategoryTypeChanges {
  color: string;
  nameTranslations: Record<string, string> | null;
}

const DEFAULT_COLOR = 'gray';

// Categories, bottles and shortages show the type with its name and color.
const REFRESHED_KEYS = [qk.categoryTypes, qk.categories, qk.bottles, qk.shortages];

function toCategoryTypeForm(categoryType?: CategoryType): CategoryTypeForm {
  return {
    name: categoryType?.name ?? '',
    color: categoryType?.color || DEFAULT_COLOR,
    translations: toTranslationForm(categoryType?.nameTranslations),
  };
}

/**
 * Form of the category types manager: it creates a type, or edits the one
 * picked in the list (its name is its key and cannot change).
 */
export function useCategoryTypeForm() {
  const typeForm = useEntityForm(toCategoryTypeForm);
  const { form, editing } = typeForm;

  const create = useEntityMutation<CategoryTypeChanges & { name: string }>({
    mutationFn: (data) => categoryTypesApi.create(data),
    invalidates: REFRESHED_KEYS,
    successMessage: 'categoryTypes.created',
    ignoreWhilePending: true,
  });
  const update = useEntityMutation<CategoryTypeChanges & { name: string }>({
    mutationFn: ({ name, ...changes }) => categoryTypesApi.update(name, changes),
    invalidates: REFRESHED_KEYS,
    successMessage: 'categoryTypes.updated',
    ignoreWhilePending: true,
  });
  const remove = useEntityMutation<string>({
    mutationFn: (name) => categoryTypesApi.delete(name),
    invalidates: REFRESHED_KEYS,
    successMessage: 'categoryTypes.deleted',
  });

  // Back to an empty "add a type" form once the type is saved.
  const resetForm = () => typeForm.open();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const changes = { color: form.color, nameTranslations: buildNameTranslations(form.translations) };
    if (editing) {
      update.mutate({ name: editing.name, ...changes }, { onSuccess: resetForm });
      return;
    }
    const name = form.name.trim().toUpperCase();
    if (name) create.mutate({ name, ...changes }, { onSuccess: resetForm });
  };

  return {
    ...typeForm,
    submit,
    resetForm,
    remove: (name: string) => remove.mutate(name),
    isSaving: create.isPending || update.isPending,
  };
}
