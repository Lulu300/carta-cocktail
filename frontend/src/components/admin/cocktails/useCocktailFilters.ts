import { useMemo, useState } from 'react';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Cocktail } from '../../../types';
import { matchesCocktailSearch } from '../../../utils/cocktailSearch';
import { parseTags } from './parseTags';

interface TagOption {
  value: string;
  label: string;
}

/** True when the cocktail has one of the selected tags, ignoring case, or when none is selected. */
function matchesTags(cocktail: Cocktail, selectedTags: string[]): boolean {
  if (selectedTags.length === 0) return true;
  const cocktailTags = parseTags(cocktail.tags).map((tag) => tag.toLowerCase());
  return selectedTags.some((tag) => cocktailTags.includes(tag.toLowerCase()));
}

/** Text search and tag filter of the admin cocktail list. */
export function useCocktailFilters(cocktails: Cocktail[]) {
  const localize = useLocalizedName();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const tagOptions = useMemo<TagOption[]>(() => {
    const tags = new Set(cocktails.flatMap((cocktail) => parseTags(cocktail.tags)));
    return [...tags].sort().map((tag) => ({ value: tag, label: tag }));
  }, [cocktails]);

  const filteredCocktails = useMemo(
    () => cocktails.filter((cocktail) =>
      matchesCocktailSearch(cocktail, search, localize, { includeNotes: true }) && matchesTags(cocktail, selectedTags),
    ),
    [cocktails, search, selectedTags, localize],
  );

  return { search, setSearch, selectedTags, setSelectedTags, tagOptions, filteredCocktails };
}
