import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { categoryTypes as categoryTypesApi } from '../services/api';
import type { CategoryType } from '../types';
import { qk } from './keys';

export function useCategoryTypes(): UseQueryResult<CategoryType[], Error> {
  return useQuery({ queryKey: qk.categoryTypes, queryFn: () => categoryTypesApi.list() });
}
