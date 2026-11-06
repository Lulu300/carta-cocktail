import { describe, it, expect } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import { captureRequest, mockApiError, mockApiResponse } from '../test/msw/utils';
import { createTestQueryClient, renderHook, waitFor } from '../test/test-utils';
import { qk } from './keys';
import { useBottles } from './bottles';
import { useCategories } from './categories';
import { useCategoryTypes } from './categoryTypes';
import { useCocktail, useCocktails, useCocktailsAvailability } from './cocktails';
import { useIngredients } from './ingredients';
import { useMenu, useMenus } from './menus';
import { useShortages } from './shortages';
import { useUnits } from './units';

interface ReadHookCase {
  name: string;
  useHook: () => UseQueryResult<unknown, Error>;
  /** Route of the endpoint, as MSW matches it. */
  route: string;
  /** Path the hook must request. */
  requestedPath: string;
  key: readonly unknown[];
}

const cases: ReadHookCase[] = [
  { name: 'useShortages', useHook: useShortages, route: '/api/shortages', requestedPath: '/api/shortages', key: qk.shortages },
  { name: 'useCategories', useHook: useCategories, route: '/api/categories', requestedPath: '/api/categories', key: qk.categories },
  { name: 'useCategoryTypes', useHook: useCategoryTypes, route: '/api/category-types', requestedPath: '/api/category-types', key: qk.categoryTypes },
  { name: 'useBottles', useHook: useBottles, route: '/api/bottles', requestedPath: '/api/bottles', key: qk.bottles },
  { name: 'useIngredients', useHook: useIngredients, route: '/api/ingredients', requestedPath: '/api/ingredients', key: qk.ingredients },
  { name: 'useUnits', useHook: useUnits, route: '/api/units', requestedPath: '/api/units', key: qk.units },
  { name: 'useCocktails', useHook: useCocktails, route: '/api/cocktails', requestedPath: '/api/cocktails', key: qk.cocktails },
  { name: 'useCocktail', useHook: () => useCocktail(7), route: '/api/cocktails/:id', requestedPath: '/api/cocktails/7', key: qk.cocktail(7) },
  {
    name: 'useCocktailsAvailability',
    useHook: useCocktailsAvailability,
    route: '/api/availability/cocktails',
    requestedPath: '/api/availability/cocktails',
    key: qk.availability,
  },
  { name: 'useMenus', useHook: useMenus, route: '/api/menus', requestedPath: '/api/menus', key: qk.menus },
  { name: 'useMenu', useHook: () => useMenu(3), route: '/api/menus/:id', requestedPath: '/api/menus/3', key: qk.menu(3) },
];

describe.each(cases)('$name', ({ useHook, route, requestedPath, key }) => {
  it('loads the data from the API and caches it under its key', async () => {
    const payload = [{ id: 1 }];
    mockApiResponse('get', route, payload);
    const request = captureRequest('get', route);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(useHook, { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    // No query string: the query context must not leak into list(params)
    const url = await request.url;
    expect(url.pathname + url.search).toBe(requestedPath);
    expect(queryClient.getQueryData(key)).toEqual(payload);
  });

  it('exposes the API error', async () => {
    mockApiError('get', route, 500, 'boom');

    const { result } = renderHook(useHook);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});

describe('useCocktailsAvailability options', () => {
  it('does not request the availability when disabled', () => {
    const request = captureRequest('get', '/api/availability/cocktails');
    const { result } = renderHook(() => useCocktailsAvailability({ enabled: false }));

    expect(result.current.fetchStatus).toBe('idle');
    expect(request.count()).toBe(0);
  });
});

describe('qk', () => {
  it('nests a single cocktail or menu under its list key, so invalidating the list covers it', () => {
    expect(qk.cocktail(7).slice(0, 1)).toEqual(qk.cocktails);
    expect(qk.menu(3).slice(0, 1)).toEqual(qk.menus);
  });
});
