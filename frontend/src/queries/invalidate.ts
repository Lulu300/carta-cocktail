import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/** Refreshes every query shown under one of the given keys. */
export function useInvalidateQueries(): (keys: QueryKey[]) => void {
  const queryClient = useQueryClient();
  return (keys) => {
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };
}
