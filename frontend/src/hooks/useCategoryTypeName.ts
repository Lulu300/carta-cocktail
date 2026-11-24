import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from './useLocalizedName';
import type { CategoryType } from '../types';

/** Shown in place of each space HTML would hide. */
const VISIBLE_SPACE = '␣';

/**
 * The whitespace HTML hides or shows as one plain space: spaces around the name, runs of two or
 * more inside it, and any whitespace other than a space (a tab, a line break).
 */
const HIDDEN_SPACES = /^\s+|\s+$|\s{2,}|[^\S ]/g;

/**
 * Data older than v1.9.0 can hold a type named ' SPIRIT ' next to 'SPIRIT', or a type with an
 * empty name, and data older than v1.15.0 a type named 'X  Y' next to 'X Y'. HTML shows the
 * spaced names exactly like the others, and the empty one as nothing.
 */
function isHiddenByHtml(name: string): boolean {
  return name === '' || name.match(HIDDEN_SPACES) !== null;
}

/**
 * Category type names as the admin can tell them apart: an empty name gets a label, the spaces
 * HTML would hide are made visible and announced in words, for screen readers too.
 * Admin screens only: its messages are in the admin bundle, so a public page would show their keys.
 */
export function useCategoryTypeName() {
  const { t } = useTranslation();
  const localize = useLocalizedName();

  /** The text as it is, unless HTML would hide part of it. */
  const visibleName = useCallback((text: string) => {
    if (!isHiddenByHtml(text)) return text;
    if (text === '') return t('categoryTypes.emptyName');
    const spacesShown = text.replace(HIDDEN_SPACES, (spaces) => VISIBLE_SPACE.repeat(spaces.length));
    return `${spacesShown} ${t('categoryTypes.withSpaces')}`;
  }, [t]);

  /**
   * The translation as the admin typed it, or the stored name made visible when there is none:
   * only stored names have to be told apart.
   */
  const localizedName = useCallback((categoryType: CategoryType) => {
    const label = localize(categoryType);
    return label === categoryType.name ? visibleName(label) : label;
  }, [localize, visibleName]);

  /**
   * The localized name. A translation would hide which of ' SPIRIT ' and 'SPIRIT' it belongs
   * to, so such a type also shows its stored name.
   */
  const typeLabel = useCallback((categoryType: CategoryType) => {
    const label = localizedName(categoryType);
    const isTranslated = localize(categoryType) !== categoryType.name;
    if (!isTranslated || !isHiddenByHtml(categoryType.name)) return label;
    return `${label} – ${visibleName(categoryType.name)}`;
  }, [localize, localizedName, visibleName]);

  /**
   * The label of a category's type: `typeLabel` of its type, or its stored type name made
   * visible when the type is not known (types still loading, or missing from the list).
   */
  const categoryTypeLabel = useCallback((name: string, categoryType: CategoryType | null | undefined) => {
    return categoryType ? typeLabel(categoryType) : visibleName(name);
  }, [typeLabel, visibleName]);

  return { visibleName, localizedName, typeLabel, categoryTypeLabel };
}
