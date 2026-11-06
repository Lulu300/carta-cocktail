import type { Cocktail, CocktailAvailability } from '../../../types';

/** Props shared by the grid card and the list row of a cocktail. */
export interface CocktailItemProps {
  cocktail: Cocktail;
  availability?: CocktailAvailability;
  availabilityLoading: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: (id: number) => void;
  onDelete: (cocktail: Cocktail) => void;
}
