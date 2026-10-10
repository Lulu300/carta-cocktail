import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
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

vi.mock('../services/api', () => ({
  availability: { getAllCocktails: vi.fn() },
  bottles: { list: vi.fn() },
  categories: { list: vi.fn() },
  categoryTypes: { list: vi.fn() },
  cocktails: { list: vi.fn(), get: vi.fn() },
  ingredients: { list: vi.fn() },
  menus: { list: vi.fn(), get: vi.fn() },
  shortages: { list: vi.fn() },
  units: { list: vi.fn() },
}));

import * as api from '../services/api';

interface ReadHookCase {
  name: string;
  useHook: () => UseQueryResult<unknown, Error>;
  apiCall: ReturnType<typeof vi.fn>;
  key: readonly unknown[];
  expectedArgs: unknown[];
}

const cases: ReadHookCase[] = [
  { name: 'useShortages', useHook: useShortages, apiCall: vi.mocked(api.shortages.list), key: qk.shortages, expectedArgs: [] },
  { name: 'useCategories', useHook: useCategories, apiCall: vi.mocked(api.categories.list), key: qk.categories, expectedArgs: [] },
  { name: 'useCategoryTypes', useHook: useCategoryTypes, apiCall: vi.mocked(api.categoryTypes.list), key: qk.categoryTypes, expectedArgs: [] },
  // No filter: the query context must not leak into list(params)
  { name: 'useBottles', useHook: useBottles, apiCall: vi.mocked(api.bottles.list), key: qk.bottles, expectedArgs: [] },
  { name: 'useIngredients', useHook: useIngredients, apiCall: vi.mocked(api.ingredients.list), key: qk.ingredients, expectedArgs: [] },
  { name: 'useUnits', useHook: useUnits, apiCall: vi.mocked(api.units.list), key: qk.units, expectedArgs: [] },
  { name: 'useCocktails', useHook: useCocktails, apiCall: vi.mocked(api.cocktails.list), key: qk.cocktails, expectedArgs: [] },
  { name: 'useCocktail', useHook: () => useCocktail(7), apiCall: vi.mocked(api.cocktails.get), key: qk.cocktail(7), expectedArgs: [7] },
  { name: 'useCocktailsAvailability', useHook: useCocktailsAvailability, apiCall: vi.mocked(api.availability.getAllCocktails), key: qk.availability, expectedArgs: [] },
  { name: 'useMenus', useHook: useMenus, apiCall: vi.mocked(api.menus.list), key: qk.menus, expectedArgs: [] },
  { name: 'useMenu', useHook: () => useMenu(3), apiCall: vi.mocked(api.menus.get), key: qk.menu(3), expectedArgs: [3] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(cases)('$name', ({ useHook, apiCall, key, expectedArgs }) => {
  it('loads the data from the API and caches it under its key', async () => {
    const payload = [{ id: 1 }];
    apiCall.mockResolvedValue(payload);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(useHook, { queryClient });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(apiCall).toHaveBeenCalledWith(...expectedArgs);
    expect(queryClient.getQueryData(key)).toEqual(payload);
  });

  it('exposes the API error', async () => {
    apiCall.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(useHook);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});

describe('qk', () => {
  it('nests a single cocktail or menu under its list key, so invalidating the list covers it', () => {
    expect(qk.cocktail(7).slice(0, 1)).toEqual(qk.cocktails);
    expect(qk.menu(3).slice(0, 1)).toEqual(qk.menus);
  });
});
