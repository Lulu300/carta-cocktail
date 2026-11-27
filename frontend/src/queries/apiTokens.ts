import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiTokens as apiTokensApi } from '../services/api';
import type { ApiToken, ApiTokenInput, CreatedApiToken } from '../types';
import { useEntityMutation, type EntityMutation } from './crud';
import { qk } from './keys';

export function useApiTokens(): UseQueryResult<ApiToken[], Error> {
  return useQuery({
    queryKey: qk.apiTokens,
    queryFn: ({ signal }) => apiTokensApi.list(signal),
  });
}

/** No success toast: the page shows the new token instead. */
export function useCreateApiToken(): EntityMutation<ApiTokenInput, CreatedApiToken> {
  return useEntityMutation<ApiTokenInput, CreatedApiToken>({
    mutationFn: (data) => apiTokensApi.create(data),
    invalidates: [qk.apiTokens],
    ignoreWhilePending: true,
  });
}

export function useRevokeApiToken(): EntityMutation<number> {
  return useEntityMutation<number>({
    mutationFn: (id) => apiTokensApi.revoke(id),
    invalidates: [qk.apiTokens],
    successMessage: 'settings.apiTokens.revoked',
  });
}
