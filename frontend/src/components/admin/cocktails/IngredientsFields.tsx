import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { CocktailAvailability } from '../../../types';
import Card from '../../ui/Card';
import AvailabilityWarnings from './AvailabilityWarnings';
import IngredientRowFields from './IngredientRowFields';
import NewIngredientField from './NewIngredientField';
import { newIngredientRow, type CocktailFormValues } from './cocktailFormSchema';
import type { RecipeLists } from './recipeLists';

const SMALL_BUTTON_CLASSES = 'text-xs px-2 py-1 border rounded';

interface IngredientsFieldsProps {
  lists: RecipeLists;
  /** Stock problems of the saved recipe; none for a new cocktail. */
  availability?: CocktailAvailability;
}

export default function IngredientsFields({ lists, availability }: IngredientsFieldsProps) {
  const { t } = useTranslation();
  const { control } = useFormContext<CocktailFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'ingredients' });
  const [showNewIngredient, setShowNewIngredient] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm text-fg-muted font-medium">{t('cocktails.ingredients')}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-expanded={showNewIngredient}
            onClick={() => setShowNewIngredient(!showNewIngredient)}
            className={`${SMALL_BUTTON_CLASSES} text-fg-muted hover:text-accent border-line-strong`}
          >
            + {t('ingredients.add')}
          </button>
          <button
            type="button"
            onClick={() => append(newIngredientRow(lists.ingredients, lists.units))}
            className={`${SMALL_BUTTON_CLASSES} text-accent hover:text-accent-soft border-accent/30`}
          >
            {t('cocktails.addIngredient')}
          </button>
        </div>
      </div>

      {showNewIngredient && <NewIngredientField onDone={() => setShowNewIngredient(false)} />}
      <AvailabilityWarnings availability={availability} loading={false} />

      <ul className="space-y-3">
        {fields.map((field, index) => (
          <IngredientRowFields key={field.id} index={index} lists={lists} onRemove={() => remove(index)} />
        ))}
      </ul>
    </Card>
  );
}
