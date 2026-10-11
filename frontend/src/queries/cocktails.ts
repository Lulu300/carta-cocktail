import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { availability as availabilityApi, cocktails as cocktailsApi } from '../services/api';
import type { Cocktail, CocktailAvailability } from '../types';
import { qk } from './keys';

export function useCocktails(): UseQueryResult<Cocktail[], Error> {
  return useQuery({ queryKey: qk.cocktails, queryFn: () => cocktailsApi.list() });
}

export function useCocktail(id: number): UseQueryResult<Cocktail, Error> {
  return useQuery({ queryKey: qk.cocktail(id), queryFn: () => cocktailsApi.get(id) });
}

/** Availability of every cocktail, keyed by cocktail id. */
export function useCocktailsAvailability(): UseQueryResult<Record<number, CocktailAvailability>, Error> {
  return useQuery({ queryKey: qk.availability, queryFn: () => availabilityApi.getAllCocktails() });
}
