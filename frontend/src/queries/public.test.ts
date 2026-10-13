import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../services/api';
import { buildCocktail, buildMenu } from '../test/factories';
import { captureRequest, mockApiResponse } from '../test/msw/utils';
import { createTestQueryClient, renderHook, waitFor } from '../test/test-utils';
import { qk } from './keys';
import { isNotFoundError, usePublicCocktail, usePublicMenu, usePublicMenus } from './public';

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const summer = buildMenu({ id: 1, name: 'Summer', slug: 'summer' });
const daiquiri = buildCocktail({ id: 7, name: 'Daiquiri' });

function signIn(token: string | null) {
  mockUseAuth.mockReturnValue({ token, user: token ? { id: 1, email: 'admin@carta.local' } : null });
}

beforeEach(() => {
  signIn(null);
  mockApiResponse('get', '/api/public/menus', []);
  mockApiResponse('get', '/api/public/menus/:slug', summer);
  mockApiResponse('get', '/api/public/cocktails/:id', daiquiri);
});

describe('public query hooks', () => {
  it('caches a menu per slug and per viewer, since an admin gets private fields', async () => {
    const requests = captureRequest('get', '/api/public/menus/:slug');
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((await requests.url).pathname).toBe('/api/public/menus/summer');
    expect(queryClient.getQueryData(qk.publicMenu('summer', 'guest'))).toEqual(summer);

    signIn('token');
    const admin = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(admin.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(qk.publicMenu('summer', 'admin'))).toEqual(summer);
    expect(requests.count()).toBe(2);
  });

  it('serves a guest from the cache when coming back to a menu', async () => {
    const requests = captureRequest('get', '/api/public/menus/:slug');
    const queryClient = createTestQueryClient();
    const first = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePublicMenu('summer'), { queryClient });

    expect(second.result.current.data).toEqual(summer);
    expect(second.result.current.isFetching).toBe(false);
    expect(requests.count()).toBe(1);
  });

  it('refreshes an admin preview in the background, since admin edits do not invalidate it', async () => {
    signIn('token');
    const requests = captureRequest('get', '/api/public/menus/:slug');
    const queryClient = createTestQueryClient();
    const first = renderHook(() => usePublicMenu('summer'), { queryClient });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => usePublicMenu('summer'), { queryClient });

    expect(second.result.current.data).toEqual(summer);
    await waitFor(() => expect(requests.count()).toBe(2));
  });

  it('loads the list of public menus', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicMenus(), { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(qk.publicMenus)).toEqual([]);
  });

  it('loads a public cocktail by id', async () => {
    const request = captureRequest('get', '/api/public/cocktails/:id');
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePublicCocktail(7), { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((await request.url).pathname).toBe('/api/public/cocktails/7');
    expect(queryClient.getQueryData(qk.publicCocktail(7, 'guest'))).toEqual(daiquiri);
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
