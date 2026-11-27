import { QueryClient, onlineManager } from '@tanstack/react-query';
import { ApiError } from '../services/api';

const MAX_RETRIES = 2;

/**
 * A client error (4xx, including an expired session) fails the same way on every
 * attempt, so only network failures and server errors are retried. Offline, a retry would
 * only pause until the network is back and leave the loading state on screen: the error
 * shows instead, with its retry button.
 */
export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (!onlineManager.isOnline()) return false;
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Admin data only changes through this UI: lists visited in the last
        // 30 seconds are shown from the cache without a new request.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
    },
  });
}
