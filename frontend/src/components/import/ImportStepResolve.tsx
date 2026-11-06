import { useTranslation } from 'react-i18next';
import type { EntityResolutionAction, ImportPreviewResponse } from '../../types';
import Button from '../ui/Button';
import { cx } from '../ui/classNames';
import ImportEntityRow from './ImportEntityRow';
import {
  IMPORT_ENTITY_TYPES,
  countIncompleteResolutions,
  resolutionKey,
  type ImportEntityType,
  type ImportResolutions,
} from './importResolutions';
import type { ImportReferenceLists } from './useImportReferenceLists';

interface ImportStepResolveProps {
  preview: ImportPreviewResponse;
  resolutions: ImportResolutions;
  onChange: (resolutions: ImportResolutions) => void;
  lists: ImportReferenceLists;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
}

export default function ImportStepResolve({ preview, resolutions, onChange, lists, canGoBack, onBack, onNext }: ImportStepResolveProps) {
  const { t } = useTranslation();

  const updateResolution = (type: ImportEntityType, key: string, resolution: EntityResolutionAction) => {
    onChange({ ...resolutions, [type]: { ...resolutions[type], [key]: resolution } });
  };

  const incompleteCount = countIncompleteResolutions(preview, resolutions);
  const totalEntities = IMPORT_ENTITY_TYPES.reduce((total, type) => total + preview[type].length, 0);

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
                categoryTypes={lists.categoryTypes}
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
        <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg p-3 text-sm">
          {t('cocktails.importWizard.cocktailExists')}
        </div>
      )}

      {lists.hasError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
          {t('cocktails.importWizard.listsLoadError')}
        </div>
      )}

      <div className={cx(
        'rounded-lg p-3 text-sm border',
        incompleteCount === 0
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      )}>
        {statusMessage()}
      </div>

      <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
        {IMPORT_ENTITY_TYPES.map(renderSection)}
      </div>

      <div className="flex justify-between">
        {canGoBack ? <Button variant="ghost" onClick={onBack}>{t('cocktails.importWizard.back')}</Button> : <span />}
        <Button onClick={onNext} disabled={incompleteCount > 0}>
          {t('cocktails.importWizard.next')}
        </Button>
      </div>
    </div>
  );
}
