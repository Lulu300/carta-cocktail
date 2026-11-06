import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ingredients as ingredientsApi } from '../services/api';
import type { Ingredient } from '../types';
import { useEntityMutation, type EntityMutation } from './crud';
import { qk } from './keys';

export function useIngredients(): UseQueryResult<Ingredient[], Error> {
  return useQuery({ queryKey: qk.ingredients, queryFn: () => ingredientsApi.list() });
}

/** Creates an ingredient from its name alone, e.g. while writing a recipe. */
export function useCreateIngredient(): EntityMutation<string, Ingredient> {
  return useEntityMutation({
    mutationFn: (name: string) => ingredientsApi.create({ name }),
    invalidates: [qk.ingredients],
    successMessage: 'ingredients.created',
    ignoreWhilePending: true,
  });
}
