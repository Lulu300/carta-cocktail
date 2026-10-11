import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createTestQueryClient, renderHook, waitFor } from '../test/test-utils';
import { ApiError } from '../services/api';
import { toast } from '../components/ui/ToastStore';
import { qk } from './keys';
import { useCrudMutations, useEntityMutation } from './crud';

vi.mock('../components/ui/ToastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface UnitInput {
  name: string;
}

const api = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const messages = { created: 'units.created', updated: 'units.updated', deleted: 'units.deleted' };

function renderCrud() {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(
    () => useCrudMutations<UnitInput>({ key: qk.units, api, invalidates: [qk.availability], messages }),
    { queryClient },
  );
  return { result, invalidate };
}

function invalidatedKeys(invalidate: { mock: { calls: unknown[][] } }) {
  return invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.create.mockResolvedValue({ id: 1 });
  api.update.mockResolvedValue({ id: 1 });
  api.delete.mockResolvedValue(undefined);
});

describe('useCrudMutations', () => {
  it('creates, then refreshes the entity list and the extra keys and shows the created toast', async () => {
    const { result, invalidate } = renderCrud();

    act(() => result.current.create.mutate({ name: 'Shot' }));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(api.create).toHaveBeenCalledWith({ name: 'Shot' });
    expect(invalidatedKeys(invalidate)).toEqual([qk.units, qk.availability]);
    expect(toast.success).toHaveBeenCalledWith('units.created');
  });

  it('updates by id and shows the updated toast', async () => {
    const { result } = renderCrud();

    act(() => result.current.update.mutate({ id: 4, data: { name: 'Dash' } }));

    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(api.update).toHaveBeenCalledWith(4, { name: 'Dash' });
    expect(toast.success).toHaveBeenCalledWith('units.updated');
  });

  it('deletes by id and shows the deleted toast', async () => {
    const { result } = renderCrud();

    act(() => result.current.remove.mutate(4));

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(api.delete).toHaveBeenCalledWith(4);
    expect(toast.success).toHaveBeenCalledWith('units.deleted');
  });

  it('shows the error in a toast and refreshes nothing when the request fails', async () => {
    const error = new ApiError(400, 'Name is required');
    api.create.mockRejectedValue(error);
    const { result, invalidate } = renderCrud();

    act(() => result.current.create.mutate({ name: '' }));

    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(error);
    expect(toast.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('names what uses an item whose deletion is refused', async () => {
    api.delete.mockRejectedValue(new ApiError(409, 'Still in use', {
      error: 'Still in use',
      details: { cocktails: [{ id: 1, name: 'Mojito', removedLines: 1 }], bottles: [] },
    }));
    const { result } = renderCrud();

    act(() => result.current.remove.mutate(4));

    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    const shown = vi.mocked(toast.error).mock.calls[0][0] as Error;
    expect(shown.message).toBe('Still in use deletion.usedByCocktails');
  });
});

describe('useEntityMutation', () => {
  it('ignores a second call while the first one is in flight, then accepts a new one', async () => {
    let finish: (value: unknown) => void = () => {};
    const mutationFn = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useEntityMutation<number>({
      mutationFn, invalidates: [qk.units], ignoreWhilePending: true,
    }));

    await act(async () => {
      result.current.mutate(1);
      result.current.mutate(1);
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);

    await act(async () => finish(undefined));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => result.current.mutate(2));
    expect(mutationFn).toHaveBeenCalledTimes(2);
  });

  it('runs overlapping calls by default, e.g. toggles on several items', async () => {
    const mutationFn = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useEntityMutation<number>({ mutationFn, invalidates: [qk.units] }));

    await act(async () => {
      result.current.mutate(1);
      result.current.mutate(2);
    });

    expect(mutationFn).toHaveBeenCalledTimes(2);
  });

  it('shows no success toast without a success message', async () => {
    const mutationFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEntityMutation<number>({ mutationFn, invalidates: [qk.units] }));

    act(() => result.current.mutate(1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
