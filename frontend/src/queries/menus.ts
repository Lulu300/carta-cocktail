import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { menus as menusApi } from '../services/api';
import type { MenuDetail, MenuSummary } from '../types';
import { qk } from './keys';

export function useMenus(): UseQueryResult<MenuSummary[], Error> {
  return useQuery({ queryKey: qk.menus, queryFn: ({ signal }) => menusApi.list(signal) });
}

export function useMenu(id: number): UseQueryResult<MenuDetail, Error> {
  return useQuery({ queryKey: qk.menu(id), queryFn: ({ signal }) => menusApi.get(id, signal) });
}
