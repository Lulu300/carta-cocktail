import type { TFunction } from 'i18next';
import type { ExistingMatch } from './importResolutions';

/**
 * Hint and error of the name (or abbreviation) of a category or unit to create, by the existing
 * row it meets. A row found is used as it is: the other fields typed are ignored, which the admin
 * must know before importing. Several rows equal ignoring case: the backend refuses the value.
 */
export function existingMatchMessages<Row>(
  t: TFunction,
  match: ExistingMatch<Row>,
  label: (row: Row) => string,
): { hint?: string; error?: string } {
  switch (match.status) {
    case 'found':
      return { hint: t('importMatches.usedAsItIs', { name: label(match.row) }) };
    case 'ambiguous':
      return {
        error: t('importMatches.ambiguousName', { names: match.rows.map(label).join(', ') }),
      };
    case 'none':
      return {};
  }
}
