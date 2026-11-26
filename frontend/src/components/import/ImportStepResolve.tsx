import { useTranslation } from 'react-i18next';
import type { EntityResolutionAction, ImportPreviewResponse } from '../../types';
import Button from '../ui/Button';
import ImportEntityRow from './ImportEntityRow';
import {
  IMPORT_ENTITY_TYPES,
  countIncompleteResolutions,
  resolutionKey,
  type ImportEntityType,
  type ImportResolutions,
} from './importResolutions';
import type { ImportReferenceLists } from './useImportReferenceLists';
import Alert from '../ui/Alert';

interface ImportStepResolveProps {
  preview: ImportPreviewResponse;
  resolutions: ImportResolutions;
  onChange: (resolutions: ImportResolutions) => void;
  lists: ImportReferenceLists;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
}

export default function ImportStepResolve({
  preview,
  resolutions,
  onChange,
  lists,
  canGoBack,
  onBack,
  onNext,
}: ImportStepResolveProps) {
  const { t } = useTranslation();

  const updateResolution = (
    type: ImportEntityType,
    key: string,
    resolution: EntityResolutionAction,
  ) => {
    onChange({ ...resolutions, [type]: { ...resolutions[type], [key]: resolution } });
  };

  const incompleteCount = countIncompleteResolutions(preview, resolutions, lists);
  const totalEntities = IMPORT_ENTITY_TYPES.reduce(
    (total, type) => total + preview[type].length,
    0,
  );

  const renderSection = (type: ImportEntityType) => {
    const entities = preview[type];
    if (entities.length === 0) return null;
    return (
      <section key={type}>
        <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-2">
          {t(`cocktails.importWizard.${type}`)} ({entities.length})
        </h3>
        <div className="space-y-2">
          {entities.map((entity) => {
            const key = resolutionKey(type, entity.ref);
            return (
              <ImportEntityRow
                key={key}
                entity={entity}
                type={type}
                existingOptions={lists[type]}
                resolution={resolutions[type][key]}
                onChange={(resolution) => updateResolution(type, key, resolution)}
                allowSkip={type === 'bottles'}
                existingRows={lists}
              />
            );
          })}
        </div>
      </section>
    );
  };

  const statusMessage = () => {
    if (totalEntities === 0) return t('cocktails.importWizard.noDependencies');
    if (incompleteCount === 0) return t('cocktails.importWizard.allResolved');
    return t('cocktails.importWizard.unresolvedCount', { count: incompleteCount });
  };

  return (
    <div className="space-y-6">
      {preview.cocktail.alreadyExists && (
        <Alert tone="warning">{t('cocktails.importWizard.cocktailExists')}</Alert>
      )}

      {lists.hasError && <Alert tone="danger">{t('cocktails.importWizard.listsLoadError')}</Alert>}

      <Alert tone={incompleteCount === 0 ? 'success' : 'warning'}>{statusMessage()}</Alert>

      <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
        {IMPORT_ENTITY_TYPES.map(renderSection)}
      </div>

      <div className="flex justify-between">
        {canGoBack ? (
          <Button variant="ghost" onClick={onBack}>
            {t('cocktails.importWizard.back')}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onNext} disabled={incompleteCount > 0}>
          {t('cocktails.importWizard.next')}
        </Button>
      </div>
    </div>
  );
}
