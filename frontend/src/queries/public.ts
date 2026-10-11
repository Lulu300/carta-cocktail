import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, publicApi } from '../services/api';
import type { Cocktail, Menu } from '../types';
import { qk, type PublicViewer } from './keys';

// A menu rarely changes during an evening: a guest coming back from a cocktail
// gets the menu from the cache, without a request on a saturated bar network.
const GUEST_STALE_TIME = 5 * 60_000;

/**
 * The request sends the stored token, so the viewer follows the token rather than
 * the user (still unknown while the token is being checked at startup).
 */
function usePublicViewer(): PublicViewer {
  const { token } = useAuth();
  return token ? 'admin' : 'guest';
}

/**
 * Admin pages do not invalidate the public queries: an admin previewing a menu
 * they just edited sees the cached version at once, refreshed in the background.
 */
function staleTimeFor(viewer: PublicViewer): number {
  return viewer === 'admin' ? 0 : GUEST_STALE_TIME;
}

/** A 404 means the page does not exist (or is not published); anything else may be retried. */
export function isNotFoundError(error: Error | null): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function usePublicMenus(): UseQueryResult<Menu[], Error> {
  const viewer = usePublicViewer();
  return useQuery({
    queryKey: qk.publicMenus,
    queryFn: () => publicApi.listMenus(),
    staleTime: staleTimeFor(viewer),
  });
}

export function usePublicMenu(slug: string): UseQueryResult<Menu, Error> {
  const viewer = usePublicViewer();
  return useQuery({
    queryKey: qk.publicMenu(slug, viewer),
    queryFn: () => publicApi.getMenu(slug),
    staleTime: staleTimeFor(viewer),
  });
}

export function usePublicCocktail(id: number): UseQueryResult<Cocktail, Error> {
  const viewer = usePublicViewer();
  return useQuery({
    queryKey: qk.publicCocktail(id, viewer),
    queryFn: () => publicApi.getCocktail(id),
    staleTime: staleTimeFor(viewer),
  });
}
