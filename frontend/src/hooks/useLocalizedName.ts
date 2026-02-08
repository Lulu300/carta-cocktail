import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { getLocalizedName } from '../utils/localization';

export function useLocalizedName() {
  const { i18n } = useTranslation();

  return useCallback(
    (entity: { name: string; nameTranslations?: Record<string, string> | null }) =>
      getLocalizedName(entity, i18n.language),
    [i18n.language]
  );
}
