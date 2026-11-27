import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { categoryTypes as categoryTypesApi } from '../services/api';
import type { CategoryTypeListItem } from '../types';
import { qk } from './keys';

export function useCategoryTypes(): UseQueryResult<CategoryTypeListItem[], Error> {
  return useQuery({
    queryKey: qk.categoryTypes,
    queryFn: ({ signal }) => categoryTypesApi.list(signal),
  });
}
