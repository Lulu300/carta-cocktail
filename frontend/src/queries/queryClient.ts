import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/api';

const MAX_RETRIES = 2;

/**
 * A client error (4xx, including an expired session) fails the same way on every
 * attempt, so only network failures and server errors are retried.
 */
export function shouldRetryQuery(failureCount: number, error: Error): boolean {
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
