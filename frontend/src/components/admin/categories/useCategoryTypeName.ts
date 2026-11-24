import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { CategoryType } from '../../../types';

/** Shown in place of each space around a name: HTML would collapse a real one. */
const VISIBLE_SPACE = '␣';

const SURROUNDING_SPACES = /^\s+|\s+$/g;

/**
 * Data older than v1.9.0 can hold a type named ' SPIRIT ' next to 'SPIRIT', or a type with an
 * empty name. HTML shows the first exactly like the second, and the last as nothing.
 */
function isHiddenByHtml(name: string): boolean {
  return name === '' || name !== name.trim();
}

/**
 * Category type names as the admin can tell them apart: an empty name gets a label, the spaces
 * around a name are made visible and announced in words, for screen readers too.
 */
export function useCategoryTypeName() {
  const { t } = useTranslation();
  const localize = useLocalizedName();

  /** The text as it is, unless HTML would hide part of it. */
  const visibleName = useCallback((text: string) => {
    if (!isHiddenByHtml(text)) return text;
    if (text === '') return t('categoryTypes.emptyName');
    const spacesShown = text.replace(SURROUNDING_SPACES, (spaces) => VISIBLE_SPACE.repeat(spaces.length));
    return `${spacesShown} ${t('categoryTypes.withSpaces')}`;
  }, [t]);

  /**
   * The localized name. A translation would hide which of ' SPIRIT ' and 'SPIRIT' it belongs
   * to, so such a type also shows its stored name.
   */
  const typeLabel = useCallback((categoryType: CategoryType) => {
    const label = localize(categoryType);
    if (label === categoryType.name) return visibleName(label);
    if (!isHiddenByHtml(categoryType.name)) return label;
    return `${label} – ${visibleName(categoryType.name)}`;
  }, [localize, visibleName]);

  return { visibleName, typeLabel };
}
