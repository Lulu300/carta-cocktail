import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { system as systemApi, type UpgradeNotice } from '../services/api';
import { useEntityMutation, type EntityMutation } from './crud';
import { qk } from './keys';

/** The required actions of the last upgrade, null when there are none to confirm. */
export function useUpgradeNotice(): UseQueryResult<UpgradeNotice | null, Error> {
  return useQuery({ queryKey: qk.upgradeNotice, queryFn: ({ signal }) => systemApi.getUpgradeNotice(signal) });
}

export function useAcknowledgeUpgradeNotice(): EntityMutation<void> {
  return useEntityMutation<void>({
    mutationFn: () => systemApi.acknowledgeUpgradeNotice(),
    invalidates: [qk.upgradeNotice],
  });
}
