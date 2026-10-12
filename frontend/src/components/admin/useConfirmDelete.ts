import { useTranslation } from 'react-i18next';
import { useConfirm } from '../../contexts/ConfirmContext';

/** Asks before a deletion; resolves to true only when the admin confirms. */
export function useConfirmDelete(): (message: string) => Promise<boolean> {
  const confirm = useConfirm();
  const { t } = useTranslation();

  return (message) => confirm({
    title: t('confirm.deleteTitle'),
    message,
    confirmLabel: t('common.delete'),
    tone: 'danger',
  });
}
