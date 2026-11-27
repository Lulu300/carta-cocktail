import { describe, it, expect, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from '../services/api';
import { createQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('does not retry a client error such as a 404', () => {
    expect(shouldRetryQuery(0, new ApiError(404, 'Not found'))).toBe(false);
  });

  it('does not retry an expired session (401)', () => {
    expect(shouldRetryQuery(0, new ApiError(401, 'Unauthorized'))).toBe(false);
  });

  it('retries a network error twice, then stops', () => {
    const networkError = new TypeError('Failed to fetch');
    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(1, networkError)).toBe(true);
    expect(shouldRetryQuery(2, networkError)).toBe(false);
  });

  it('retries a server error (5xx)', () => {
    expect(shouldRetryQuery(0, new ApiError(503, 'Unavailable'))).toBe(true);
  });

  it('does not retry offline, where a retry would only pause', () => {
    onlineManager.setOnline(false);
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('caches data for 30 seconds, ignores window focus and uses the retry rule', () => {
    const queries = createQueryClient().getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.retry).toBe(shouldRetryQuery);
  });

  it('returns a new client on each call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});
