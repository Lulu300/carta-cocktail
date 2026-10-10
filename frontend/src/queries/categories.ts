import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { categories as categoriesApi } from '../services/api';
import type { Category } from '../types';
import { qk } from './keys';

export function useCategories(): UseQueryResult<Category[], Error> {
  return useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list() });
}
