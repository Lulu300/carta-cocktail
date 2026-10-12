import { useId } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import IconButton from '../../ui/IconButton';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { SOURCE_KEYS, SOURCE_TYPES, type CocktailFormValues, type SourceType } from './cocktailFormSchema';
import { hasStock, type RecipeLists } from './recipeLists';
import { useErrorText } from './useErrorText';

const SOURCE_LABEL_KEYS: Record<SourceType, string> = {
  BOTTLE: 'cocktails.specificBottle',
  CATEGORY: 'cocktails.categoryType',
  INGREDIENT: 'cocktails.freeIngredient',
};

const CONTROL_CLASSES = 'min-w-0 px-2 py-1.5 text-sm';

/** The empty option of a select holds null, any other option its numeric id. */
function toId(value: unknown): number | null {
  return value === '' || value == null ? null : Number(value);
}

interface SourceOption {
  id: number;
  label: string;
}

type Localize = ReturnType<typeof useLocalizedName>;

function sourceOptions(sourceType: SourceType, lists: RecipeLists, localize: Localize, selectedBottleId: number | null): SourceOption[] {
  switch (sourceType) {
    case 'BOTTLE':
      // An empty bottle is only listed when the recipe already uses it.
      return lists.bottles
        .filter((bottle) => hasStock(bottle) || bottle.id === selectedBottleId)
        .map((bottle) => ({ id: bottle.id, label: `${bottle.name} (${bottle.category ? localize(bottle.category) : ''})` }));
    case 'CATEGORY':
      return lists.categories.map((category) => ({ id: category.id, label: localize(category) }));
    case 'INGREDIENT':
      return lists.ingredients.map((ingredient) => ({ id: ingredient.id, label: localize(ingredient) }));
  }
}

interface IngredientRowFieldsProps {
  index: number;
  lists: RecipeLists;
  onRemove: () => void;
}

/** One recipe line: its source, the bottle, category or ingredient, the quantity and the unit. */
export default function IngredientRowFields({ index, lists, onRemove }: IngredientRowFieldsProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const errorText = useErrorText();
  const errorId = useId();
  const { control, register, setValue, formState: { errors } } = useFormContext<CocktailFormValues>();
  const path = `ingredients.${index}` as const;
  const [sourceType, categoryId, bottleId] = useWatch({
    control,
    name: [`${path}.sourceType`, `${path}.categoryId`, `${path}.bottleId`],
  });
  const sourceKey = SOURCE_KEYS[sourceType];

  const rowErrors = errors.ingredients?.[index];
  const sourceError = errorText(rowErrors?.[sourceKey]);
  const quantityError = errorText(rowErrors?.quantity);
  const unitError = errorText(rowErrors?.unitId);
  const messages = [sourceError, quantityError, unitError].filter(Boolean);
  const invalidProps = (error: string | undefined) =>
    error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};

  const clearPreferredBottles = () => setValue(`${path}.preferredBottleIds`, []);
  // Ids picked for the previous source would point to the wrong table.
  const resetSource = () => {
    setValue(`${path}.bottleId`, null);
    setValue(`${path}.categoryId`, null);
    setValue(`${path}.ingredientId`, null);
    clearPreferredBottles();
  };

  const categoryBottles = lists.bottles.filter((bottle) => bottle.categoryId === categoryId);

  return (
    <li className="bg-canvas rounded-lg p-3 space-y-2">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_5.5rem_5.5rem_auto] md:items-center">
        <Select aria-label={t('cocktails.sourceType')} className={CONTROL_CLASSES} {...register(`${path}.sourceType`, { onChange: resetSource })}>
          {SOURCE_TYPES.map((type) => <option key={type} value={type}>{t(SOURCE_LABEL_KEYS[type])}</option>)}
        </Select>

        <Select
          // A new select for each source: it registers the id of that source.
          key={sourceType}
          aria-label={t(SOURCE_LABEL_KEYS[sourceType])}
          className={CONTROL_CLASSES}
          {...invalidProps(sourceError)}
          {...register(`${path}.${sourceKey}`, {
            setValueAs: toId,
            onChange: sourceType === 'CATEGORY' ? clearPreferredBottles : undefined,
          })}
        >
          <option value="">--</option>
          {sourceOptions(sourceType, lists, localize, bottleId).map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </Select>

        <Input
          type="number"
          step="0.1"
          min="0"
          aria-label={t('cocktails.quantity')}
          placeholder={t('cocktails.quantity')}
          className={CONTROL_CLASSES}
          {...invalidProps(quantityError)}
          {...register(`${path}.quantity`, { valueAsNumber: true })}
        />

        <Select aria-label={t('cocktails.unit')} className={CONTROL_CLASSES} {...invalidProps(unitError)} {...register(`${path}.unitId`, { setValueAs: toId })}>
          <option value="">--</option>
          {lists.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.abbreviation}</option>)}
        </Select>

        <IconButton icon="close" label={t('common.delete')} variant="danger" className="justify-self-end" onClick={onRemove} />
      </div>

      {messages.length > 0 && (
        <p id={errorId} className="text-xs text-danger">{messages.join(' · ')}</p>
      )}

      {sourceType === 'CATEGORY' && categoryId != null && (
        <Controller
          control={control}
          name={`${path}.preferredBottleIds`}
          render={({ field }) => (
            <fieldset className="pl-2">
              <legend className="text-xs text-fg-muted mb-1">{t('cocktails.preferredBottles')}</legend>
              <div className="flex flex-wrap gap-2">
                {/* An empty bottle stays listed while it is preferred, so it can be unticked. */}
                {categoryBottles.filter((bottle) => hasStock(bottle) || field.value.includes(bottle.id)).map((bottle) => (
                  <label key={bottle.id} className="flex items-center gap-1 text-xs text-fg">
                    <input
                      type="checkbox"
                      checked={field.value.includes(bottle.id)}
                      onChange={(event) => field.onChange(event.target.checked
                        ? [...field.value, bottle.id]
                        : field.value.filter((id) => id !== bottle.id))}
                      className="accent-accent"
                    />
                    {bottle.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />
      )}
    </li>
  );
}
