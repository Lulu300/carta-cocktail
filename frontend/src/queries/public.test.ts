import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestQueryClient, renderHook, waitFor } from '../test/test-utils';
import { qk } from './keys';
import { isNotFoundError, usePublicCocktail, usePublicMenu, usePublicMenus } from './public';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ApiError: actual.ApiError,
    publicApi: { listMenus: vi.fn(), getMenu: vi.fn(), getCocktail: vi.fn() },
  };
});

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { ApiError, publicApi } from '../services/api';

function signIn(token: string | null) {
  mockUseAuth.mockReturnValue({ token, user: token ? { id: 1, email: 'admin@carta.local' } : null });
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn(null);
  vi.mocked(publicApi.listMenus).mockResolvedValue([]);
  vi.mocked(publicApi.getMenu).mockResolvedValue({ id: 1 } as never);
  vi.mocked(publicApi.getCocktail).mockResolvedValue({ id: 7 } as never);
});

describe('public query hooks', () => {
  it('caches a menu per slug and per viewer, since an admin gets private fields', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(publicApi.getMenu).toHaveBeenCalledWith('summer');
    expect(queryClient.getQueryData(qk.publicMenu('summer', 'guest'))).toEqual({ id: 1 });

    signIn('token');
    const admin = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(admin.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(qk.publicMenu('summer', 'admin'))).toEqual({ id: 1 });
    expect(publicApi.getMenu).toHaveBeenCalledTimes(2);
  });

  it('serves a guest from the cache when coming back to a menu', async () => {
    const queryClient = createTestQueryClient();
    const first = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePublicMenu('summer'), { queryClient });

    expect(second.result.current.data).toEqual({ id: 1 });
    expect(second.result.current.isFetching).toBe(false);
    expect(publicApi.getMenu).toHaveBeenCalledTimes(1);
  });

  it('refreshes an admin preview in the background, since admin edits do not invalidate it', async () => {
    signIn('token');
    const queryClient = createTestQueryClient();
    const first = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePublicMenu('summer'), { queryClient });

    expect(second.result.current.data).toEqual({ id: 1 });
    await waitFor(() => expect(publicApi.getMenu).toHaveBeenCalledTimes(2));
  });

  it('loads the list of public menus', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicMenus(), { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(qk.publicMenus)).toEqual([]);
  });

  it('loads a public cocktail by id', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicCocktail(7), { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(publicApi.getCocktail).toHaveBeenCalledWith(7);
    expect(queryClient.getQueryData(qk.publicCocktail(7, 'guest'))).toEqual({ id: 7 });
  });
});

describe('isNotFoundError', () => {
  it('only recognizes a 404 from the API', () => {
    expect(isNotFoundError(new ApiError(404, 'Not found'))).toBe(true);
    expect(isNotFoundError(new ApiError(500, 'Server error'))).toBe(false);
    expect(isNotFoundError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
