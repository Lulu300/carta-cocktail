import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from './useLocalizedName';
import { composeName, replaceInvisibleCharacters, SPACE_LIKE } from '../utils/invisibleCharacters';
import type { CategoryType } from '../types';

/** Shown in place of each space HTML would hide. */
const VISIBLE_SPACE = '␣';

/**
 * The spaces HTML hides or shows as one plain space: spaces around the name, runs of two or more
 * inside it, and any space other than a plain one (a tab, a line break, a braille pattern blank).
 */
const HIDDEN_SPACES = new RegExp(String.raw`^${SPACE_LIKE}+|${SPACE_LIKE}+$|${SPACE_LIKE}{2,}|(?! )${SPACE_LIKE}`, 'gu');

/** Shown in place of a character HTML draws as nothing: its code point, which names it. */
function codePointLabel(char: string): string {
  const hex = (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
  return `[U+${hex}]`;
}

function hasInvisibleCharacters(name: string): boolean {
  return replaceInvisibleCharacters(name, () => '') !== name;
}

/**
 * Not in the composed form a new name is stored in: a decomposed letter ('E\u0300') looks exactly
 * like the composed one ('È'), so there is nothing to show, only a note.
 */
function isNotComposed(name: string): boolean {
  return composeName(name) !== name;
}

/**
 * Data older than v1.9.0 can hold a type named ' SPIRIT ' next to 'SPIRIT', or a type with an
 * empty name, and data stored before new names were tidied a type named 'X  Y' or 'X\u2800Y'
 * (braille pattern blank) next to 'X Y', 'X\u200BY' (with a zero-width space) next to 'XY', or
 * 'E\u0300' (decomposed) next to 'È'. HTML shows the spaced names, the names with an invisible
 * character and the decomposed ones exactly like the others, and the empty one as nothing.
 */
function isHiddenByHtml(name: string): boolean {
  return name === '' || name.match(HIDDEN_SPACES) !== null || hasInvisibleCharacters(name) || isNotComposed(name);
}

/**
 * Category type names as the admin can tell them apart: an empty name gets a label, the spaces and
 * the characters HTML would hide are made visible and announced in words, for screen readers too.
 * Admin screens only: its messages are in the admin bundle, so a public page would show their keys.
 */
export function useCategoryTypeName() {
  const { t } = useTranslation();
  const localize = useLocalizedName();

  /** The text as it is, unless HTML would hide part of it. */
  const visibleName = useCallback((text: string) => {
    if (text === '') return t('categoryTypes.emptyName');
    // Characters first: a byte order mark is white space for JS, but it is shown by its code point
    const charactersShown = replaceInvisibleCharacters(text, codePointLabel);
    const spacesShown = charactersShown.replace(HIDDEN_SPACES, (spaces) => VISIBLE_SPACE.repeat(spaces.length));
    const notes: string[] = [];
    if (spacesShown !== charactersShown) notes.push(t('categoryTypes.withSpaces'));
    if (charactersShown !== text) notes.push(t('categoryTypes.withInvisibleCharacters'));
    if (isNotComposed(text)) notes.push(t('categoryTypes.nonStandardForm'));
    return notes.length === 0 ? text : `${spacesShown} ${notes.join(' ')}`;
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
