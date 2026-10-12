import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient, type QueryKey, type UseMutationResult } from '@tanstack/react-query';
import { toast } from '../components/ui/ToastStore';
import { describeMutationError } from './deletionImpact';

interface EntityMutationOptions<Variables, Result> {
  mutationFn: (variables: Variables) => Promise<Result>;
  /** Queries that show the changed data: refreshed after a success. */
  invalidates: QueryKey[];
  /** i18n key of the success toast. Left out when the page already shows the change, e.g. a toggle. */
  successMessage?: string;
  /**
   * Ignores a call while the previous one is in flight, for a form submission.
   * Its button is only disabled once React re-renders, which TanStack Query
   * schedules after the event: a fast double click would otherwise send twice.
   */
  ignoreWhilePending?: boolean;
}

/** `Result` is what the request returns, e.g. the created entity. */
export type EntityMutation<Variables, Result = unknown> = UseMutationResult<Result, Error, Variables>;

/** Refreshes every query shown under one of the given keys. */
export function useInvalidateQueries(): (keys: QueryKey[]) => void {
  const queryClient = useQueryClient();
  return (keys) => {
    for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
  };
}

/**
 * A mutation that refreshes the given queries and reports its outcome in a toast.
 * Only `mutate` honours `ignoreWhilePending`: `mutateAsync` is TanStack Query's own.
 */
export function useEntityMutation<Variables, Result = unknown>({
  mutationFn,
  invalidates,
  successMessage,
  ignoreWhilePending = false,
}: EntityMutationOptions<Variables, Result>): EntityMutation<Variables, Result> {
  const { t } = useTranslation();
  const invalidateQueries = useInvalidateQueries();
  const inFlight = useRef(false);

  const mutation = useMutation<Result, Error, Variables>({
    mutationFn,
    onSuccess: () => {
      if (successMessage) toast.success(t(successMessage));
      invalidateQueries(invalidates);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, t));
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const mutate: EntityMutation<Variables, Result>['mutate'] = (...args) => {
    if (ignoreWhilePending && inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(...args);
  };

  return { ...mutation, mutate };
}

interface CrudApi<Input> {
  create(data: Input): Promise<unknown>;
  update(id: number, data: Partial<Input>): Promise<unknown>;
  delete(id: number): Promise<unknown>;
}

export interface UpdateVariables<Input> {
  id: number;
  data: Partial<Input>;
}

interface CrudMutationsOptions<Input> {
  key: QueryKey;
  api: CrudApi<Input>;
  /** Other queries that show this entity, e.g. the cocktail availability. */
  invalidates?: QueryKey[];
  /** i18n keys of the success toasts. */
  messages: { created: string; updated: string; deleted: string };
}

export interface CrudMutations<Input> {
  create: EntityMutation<Input>;
  update: EntityMutation<UpdateVariables<Input>>;
  remove: EntityMutation<number>;
}

/** Create, update and delete mutations of an admin list page. */
export function useCrudMutations<Input>({
  key,
  api,
  invalidates = [],
  messages,
}: CrudMutationsOptions<Input>): CrudMutations<Input> {
  const refreshed = [key, ...invalidates];

  const create = useEntityMutation<Input>({
    mutationFn: (data) => api.create(data),
    invalidates: refreshed,
    successMessage: messages.created,
    ignoreWhilePending: true,
  });
  const update = useEntityMutation<UpdateVariables<Input>>({
    mutationFn: ({ id, data }) => api.update(id, data),
    invalidates: refreshed,
    successMessage: messages.updated,
    ignoreWhilePending: true,
  });
  const remove = useEntityMutation<number>({
    mutationFn: (id) => api.delete(id),
    invalidates: refreshed,
    successMessage: messages.deleted,
  });

  return { create, update, remove };
}
