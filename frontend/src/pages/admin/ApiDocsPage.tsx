import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import LoadError from '../../components/admin/LoadError';
import { useOpenApiDocument } from '../../queries/system';

// The viewer weighs far more than the rest of the admin: it loads with this page only
const ApiReference = lazy(() => import('../../components/admin/ApiReference'));

/** Served without a session: what scripts and integrations read first. */
const PUBLIC_DOCUMENT_URL = '/api/openapi.json';

function Loading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="text-center py-12 text-fg-muted">
      {t('common.loading')}
    </div>
  );
}

export default function ApiDocsPage() {
  const { t } = useTranslation();
  const { data: document, isPending, isError, refetch } = useOpenApiDocument();

  const renderContent = () => {
    if (isPending) return <Loading />;
    if (isError) return <LoadError onRetry={() => refetch()} />;
    return (
      <Suspense fallback={<Loading />}>
        <ApiReference document={document} />
      </Suspense>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif text-accent mb-4">{t('apiDocs.title')}</h1>
      <div className="space-y-2 text-fg-muted mb-8 max-w-3xl">
        <p>{t('apiDocs.intro')}</p>
        <p>
          {t('apiDocs.publicDocument')}{' '}
          <a href={PUBLIC_DOCUMENT_URL} className="text-accent underline">
            {PUBLIC_DOCUMENT_URL}
          </a>
        </p>
      </div>
      {renderContent()}
    </div>
  );
}
