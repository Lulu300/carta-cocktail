import { useTranslation } from 'react-i18next';

/** Text of a form error: the schema gives i18n keys as messages. */
export function useErrorText(): (error?: { message?: string }) => string | undefined {
  const { t } = useTranslation();
  return (error) => (error?.message ? t(error.message) : undefined);
}
