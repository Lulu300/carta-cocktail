import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { units as unitsApi } from '../services/api';
import type { Unit } from '../types';
import { qk } from './keys';

export function useUnits(): UseQueryResult<Unit[], Error> {
  return useQuery({ queryKey: qk.units, queryFn: () => unitsApi.list() });
}
