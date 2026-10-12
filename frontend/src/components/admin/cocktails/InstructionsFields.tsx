import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Card from '../../ui/Card';
import IconButton from '../../ui/IconButton';
import Input from '../../ui/Input';
import type { CocktailFormValues } from './cocktailFormSchema';

/** Recipe steps, in order. Blank steps are dropped when the cocktail is saved. */
export default function InstructionsFields() {
  const { t } = useTranslation();
  const { control, register } = useFormContext<CocktailFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'instructions' });

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm text-fg-muted font-medium">{t('cocktails.instructions')}</h2>
        <button
          type="button"
          onClick={() => append({ text: '' })}
          className="text-xs text-accent hover:text-accent-soft px-2 py-1 border border-accent/30 rounded"
        >
          {t('cocktails.addInstruction')}
        </button>
      </div>
      <ol className="space-y-2">
        {fields.map((field, index) => {
          const stepLabel = t('cocktails.step', { number: index + 1 });
          return (
            <li key={field.id} className="flex gap-2 items-center">
              <span aria-hidden="true" className="text-xs text-fg-muted w-6">{index + 1}.</span>
              <Input aria-label={stepLabel} className="text-sm" {...register(`instructions.${index}.text`)} />
              <IconButton icon="close" label={t('common.delete')} variant="danger" onClick={() => remove(index)} />
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
