import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { bottles as bottlesApi } from '../services/api';
import type { Bottle } from '../types';
import { qk } from './keys';

export function useBottles(): UseQueryResult<Bottle[], Error> {
  // Wrapped: list() takes filters, which must not receive the query context
  return useQuery({ queryKey: qk.bottles, queryFn: () => bottlesApi.list() });
}
