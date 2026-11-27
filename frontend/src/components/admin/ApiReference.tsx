import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { useAuth } from '../../contexts/AuthContext';
import { scalarConfiguration } from './apiReferenceConfiguration';

/** The OpenAPI document, rendered by Scalar with a "Test Request" button that uses the session. */
export default function ApiReference({ document }: { document: Record<string, unknown> }) {
  const { i18n } = useTranslation();
  const { token } = useAuth();
  const language = i18n.resolvedLanguage ?? 'en';
  const configuration = useMemo(
    () => scalarConfiguration(document, token, language),
    [document, token, language],
  );

  return <ApiReferenceReact configuration={configuration} />;
}
