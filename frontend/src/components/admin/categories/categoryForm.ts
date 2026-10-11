import type { Category, CategoryType } from '../../../types';
import { buildNameTranslations, toTranslationForm, type TranslationForm } from '../../../utils/translations';

/** Value of the type select meaning "a type that is not in the list yet", typed by hand. */
export const OTHER_TYPE = '__OTHER__';

const DEFAULT_TYPE = 'SPIRIT';
const DEFAULT_DESIRED_STOCK = 1;
const DEFAULT_MINIMUM_PERCENT = 30;

export interface CategoryForm {
  name: string;
  /** A known type name, or OTHER_TYPE. */
  type: string;
  customType: string;
  desiredStock: number;
  minimumPercent: number;
  translations: TranslationForm;
}

export interface CategoryInput {
  name: string;
  type: string;
  desiredStock: number;
  minimumPercent: number;
  nameTranslations: Record<string, string> | null;
}

/** A category whose type is not in the list (yet) shows it as a custom type. */
export function toCategoryForm(categoryTypes: CategoryType[], category?: Category): CategoryForm {
  if (!category) {
    return {
      name: '',
      type: categoryTypes[0]?.name ?? DEFAULT_TYPE,
      customType: '',
      desiredStock: DEFAULT_DESIRED_STOCK,
      minimumPercent: DEFAULT_MINIMUM_PERCENT,
      translations: toTranslationForm(null),
    };
  }
  const isKnownType = categoryTypes.some((categoryType) => categoryType.name === category.type);
  return {
    name: category.name,
    type: isKnownType ? category.type : OTHER_TYPE,
    customType: isKnownType ? '' : category.type,
    desiredStock: category.desiredStock,
    minimumPercent: category.minimumPercent,
    translations: toTranslationForm(category.nameTranslations),
  };
}

/** Null when the custom type is blank: the category needs a type. */
export function toCategoryInput(form: CategoryForm): CategoryInput | null {
  const type = form.type === OTHER_TYPE ? form.customType.trim().toUpperCase() : form.type;
  if (!type) return null;
  return {
    name: form.name,
    type,
    desiredStock: form.desiredStock,
    minimumPercent: form.minimumPercent,
    nameTranslations: buildNameTranslations(form.translations),
  };
}
