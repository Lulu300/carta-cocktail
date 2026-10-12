import { useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Cocktail, CocktailAvailability, CocktailInput } from '../../../types';
import { useCreateCocktail, useUpdateCocktail, useUploadCocktailImage } from '../../../queries/cocktails';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Field from '../../ui/Field';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import ToggleSwitch from '../../ui/ToggleSwitch';
import ImagePicker from './ImagePicker';
import IngredientsFields from './IngredientsFields';
import InstructionsFields from './InstructionsFields';
import TagList from './TagList';
import {
  EMPTY_COCKTAIL_FORM,
  cocktailFormSchema,
  fromCocktail,
  toCocktailInput,
  type CocktailFormValues,
  type ValidCocktailForm,
} from './cocktailFormSchema';
import type { RecipeLists } from './recipeLists';
import { useErrorText } from './useErrorText';

const LIST_PATH = '/admin/cocktails';

interface CocktailEditorProps {
  /** The cocktail to edit, or undefined to create one. */
  cocktail?: Cocktail;
  availability?: CocktailAvailability;
  lists: RecipeLists;
}

export default function CocktailEditor({ cocktail, availability, lists }: CocktailEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const create = useCreateCocktail();
  const update = useUpdateCocktail();
  const uploadImage = useUploadCocktailImage();
  const [imageFile, setImageFile] = useState<File | null>(null);
  // formState.isSubmitting only disables the button once React re-renders:
  // this ref also stops a second submit fired before that (fast double click).
  const isSaving = useRef(false);

  // A refetch of the cocktail resets the form, but keeps what the admin has changed.
  const values = useMemo(() => (cocktail ? fromCocktail(cocktail) : undefined), [cocktail]);
  const form = useForm<CocktailFormValues, unknown, ValidCocktailForm>({
    resolver: zodResolver(cocktailFormSchema),
    defaultValues: EMPTY_COCKTAIL_FORM,
    values,
    resetOptions: { keepDirtyValues: true },
  });
  const { control, register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const tags = useWatch({ control, name: 'tags' });

  /** Saves the recipe, then the picked image. Each mutation shows its own error toast. */
  const saveRecipe = async (data: CocktailInput) => {
    let saved: Cocktail;
    try {
      saved = cocktail ? await update.mutateAsync({ id: cocktail.id, data }) : await create.mutateAsync(data);
    } catch {
      return;
    }
    try {
      if (imageFile) await uploadImage.mutateAsync({ id: saved.id, file: imageFile });
      navigate(LIST_PATH);
    } catch {
      // The cocktail exists now: its edit page updates it on the next save
      // instead of creating a duplicate.
      if (!cocktail) navigate(`${LIST_PATH}/${saved.id}`, { replace: true });
    }
  };

  const save = async (validValues: ValidCocktailForm) => {
    if (isSaving.current) return;
    isSaving.current = true;
    try {
      await saveRecipe(toCocktailInput(validValues));
    } finally {
      isSaving.current = false;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-serif text-accent mb-6">
        {cocktail ? t('cocktails.edit') : t('cocktails.add')}
      </h1>

      <FormProvider {...form}>
        {/* The schema validates, with messages placed on each field and row. */}
        <form noValidate onSubmit={(event) => handleSubmit(save)(event)}className="space-y-6">
          <Card className="space-y-4">
            <Field label={t('cocktails.name')} error={errorText(errors.name)} required>
              <Input {...register('name')} />
            </Field>
            <Field label={t('cocktails.description')}>
              <Textarea rows={3} className="resize-none" {...register('description')} />
            </Field>
            <Field label={t('cocktails.notes')}>
              <Textarea rows={2} className="resize-none" {...register('notes')} />
            </Field>
            <Field label={t('cocktails.tags')}>
              <Input placeholder={t('cocktails.tagsPlaceholder')} {...register('tags')} />
            </Field>
            <TagList tags={tags} className="gap-1.5" />
            <Controller
              control={control}
              name="isAvailable"
              render={({ field }) => (
                <ToggleSwitch checked={field.value} onChange={field.onChange} label={t('cocktails.available')} />
              )}
            />
          </Card>

          <ImagePicker imagePath={cocktail?.imagePath ?? null} onChange={setImageFile} />
          <IngredientsFields lists={lists} availability={availability} />
          <InstructionsFields />

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => navigate(LIST_PATH)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
