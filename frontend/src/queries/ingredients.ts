import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ingredients as ingredientsApi } from '../services/api';
import type { Ingredient } from '../types';
import { qk } from './keys';

export function useIngredients(): UseQueryResult<Ingredient[], Error> {
  return useQuery({ queryKey: qk.ingredients, queryFn: () => ingredientsApi.list() });
}
