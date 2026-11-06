import { useLocation, useParams } from 'react-router-dom';

/** Router state of the page a cocktail form opens for the cocktail it just created. */
export interface CocktailFormLocationState {
  formKey: string;
}

/**
 * Identity of the cocktail form at the current address, given as `key` to the form.
 * Each cocktail, and each visit of the creation page, gets a fresh form. A cocktail
 * whose image upload failed right after its creation keeps the form that created it,
 * passed in the router state, so the picked image survives the switch to its page.
 */
export function useCocktailFormKey(): string {
  const { id } = useParams();
  const { key, state } = useLocation();
  const formKey = (state as Partial<CocktailFormLocationState> | null)?.formKey;
  return formKey ?? id ?? `new-${key}`;
}
