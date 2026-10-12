import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { availability as availabilityApi, cocktails as cocktailsApi } from '../services/api';
import type { Cocktail, CocktailAvailability, CocktailInput } from '../types';
import { useEntityMutation, type EntityMutation } from './crud';
import { qk } from './keys';

// qk.cocktails is the prefix of every qk.cocktail(id): one key refreshes the list and the recipes.
const RECIPE_KEYS = [qk.cocktails, qk.availability];

export function useCocktails(): UseQueryResult<Cocktail[], Error> {
  return useQuery({ queryKey: qk.cocktails, queryFn: () => cocktailsApi.list() });
}

/** One cocktail; nothing is requested without an id, e.g. on the creation form. */
export function useCocktail(id: number | undefined): UseQueryResult<Cocktail, Error> {
  return useQuery({
    queryKey: qk.cocktail(id ?? 0),
    queryFn: () => cocktailsApi.get(id as number),
    enabled: id !== undefined,
  });
}

/** Caches a cocktail the server just returned, so its page shows it without loading. */
export function useSetCocktailData(): (cocktail: Cocktail) => void {
  const queryClient = useQueryClient();
  return (cocktail) => queryClient.setQueryData(qk.cocktail(cocktail.id), cocktail);
}

interface AvailabilityQueryOptions {
  /** False skips the request, e.g. for a guest who may not read stock levels. */
  enabled?: boolean;
}

/** Availability of every cocktail, keyed by cocktail id. */
export function useCocktailsAvailability(
  { enabled = true }: AvailabilityQueryOptions = {},
): UseQueryResult<Record<number, CocktailAvailability>, Error> {
  return useQuery({ queryKey: qk.availability, queryFn: () => availabilityApi.getAllCocktails(), enabled });
}

export function useCreateCocktail(): EntityMutation<CocktailInput, Cocktail> {
  return useEntityMutation({
    mutationFn: (data: CocktailInput) => cocktailsApi.create(data),
    invalidates: RECIPE_KEYS,
    successMessage: 'cocktails.created',
  });
}

interface CocktailUpdate {
  id: number;
  /** The full recipe: the update only writes the fields it receives. */
  data: CocktailInput;
}

export function useUpdateCocktail(): EntityMutation<CocktailUpdate, Cocktail> {
  return useEntityMutation({
    mutationFn: ({ id, data }: CocktailUpdate) => cocktailsApi.update(id, data),
    // Menus show the names of their cocktails.
    invalidates: [...RECIPE_KEYS, qk.menus],
    successMessage: 'cocktails.updated',
  });
}

interface ImageUpload {
  id: number;
  file: File;
}

export function useUploadCocktailImage(): EntityMutation<ImageUpload, Cocktail> {
  return useEntityMutation({
    mutationFn: ({ id, file }: ImageUpload) => cocktailsApi.uploadImage(id, file),
    invalidates: [qk.cocktails],
  });
}

export function useDeleteCocktail(): EntityMutation<number> {
  return useEntityMutation({
    mutationFn: (id: number) => cocktailsApi.delete(id),
    // Menus list their cocktails and count them.
    invalidates: [qk.cocktails, qk.menus],
    successMessage: 'cocktails.deleted',
  });
}
