import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { shortages as shortagesApi } from '../services/api';
import type { Shortage } from '../types';
import { qk } from './keys';

export function useShortages(): UseQueryResult<Shortage[], Error> {
  return useQuery({ queryKey: qk.shortages, queryFn: () => shortagesApi.list() });
}
