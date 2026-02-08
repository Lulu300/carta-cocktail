import { useTranslation } from 'react-i18next';
import type { ImportPreviewResponse, EntityResolutionAction } from '../../types';

interface ImportStepConfirmProps {
  preview: ImportPreviewResponse;
  resolutions: Record<string, Record<string, EntityResolutionAction>>;
  isLoading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export default function ImportStepConfirm({ preview, resolutions, isLoading, onBack, onConfirm }: ImportStepConfirmProps) {
  const { t } = useTranslation();

  const entitiesToCreate: { type: string; name: string }[] = [];
  const entitiesMapped: { type: string; name: string; mappedTo: string }[] = [];
  const entitiesSkipped: { type: string; name: string }[] = [];

  const processSection = (type: string, label: string, entities: ImportPreviewResponse['units']) => {
    for (const entity of entities) {
      const key = type === 'units'
        ? entity.ref.abbreviation?.toLowerCase()
        : entity.ref.name?.toLowerCase();
      const resolution = resolutions[type]?.[key];

      if (resolution?.action === 'create') {
        entitiesToCreate.push({ type: label, name: resolution.data?.name || entity.ref.name });
      } else if (resolution?.action === 'skip') {
        entitiesSkipped.push({ type: label, name: entity.ref.name });
      } else if (entity.status === 'matched' || resolution?.action === 'use_existing') {
        entitiesMapped.push({
          type: label,
          name: entity.ref.name,
          mappedTo: entity.existingMatch?.name || '?',
        });
      }
    }
  };

  processSection('units', t('cocktails.importWizard.units'), preview.units);
  processSection('categories', t('cocktails.importWizard.categories'), preview.categories);
  processSection('bottles', t('cocktails.importWizard.bottles'), preview.bottles);
  processSection('ingredients', t('cocktails.importWizard.ingredients'), preview.ingredients);

  return (
    <div className="space-y-6">
      {/* Cocktail summary */}
      <div className="bg-[#0f0f1a] border border-gray-700 rounded-xl p-5">
        <p className="text-xl font-bold font-serif text-amber-400">{preview.cocktail.name}</p>
        {preview.cocktail.description && (
          <p className="text-sm text-gray-400 mt-1 italic">{preview.cocktail.description}</p>
        )}
      </div>

      {/* Entities to create */}
      {entitiesToCreate.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-green-400 mb-2">
            {t('cocktails.importWizard.entitiesToCreate')} ({entitiesToCreate.length})
          </h3>
          <div className="space-y-1">
            {entitiesToCreate.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-green-500/5 border border-green-500/10 rounded px-3 py-1.5">
                <span className="text-green-400">+</span>
                <span className="text-xs text-gray-500 w-20">{e.type}</span>
                <span>{e.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entities mapped */}
      {entitiesMapped.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">
            {t('cocktails.importWizard.entitiesMapped')} ({entitiesMapped.length})
          </h3>
          <div className="space-y-1">
            {entitiesMapped.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-blue-500/5 border border-blue-500/10 rounded px-3 py-1.5">
                <span className="text-blue-400">~</span>
                <span className="text-xs text-gray-500 w-20">{e.type}</span>
                <span>{e.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entities skipped */}
      {entitiesSkipped.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            {t('cocktails.importWizard.skip')} ({entitiesSkipped.length})
          </h3>
          <div className="space-y-1">
            {entitiesSkipped.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-500 bg-gray-500/5 border border-gray-500/10 rounded px-3 py-1.5">
                <span>-</span>
                <span className="text-xs w-20">{e.type}</span>
                <span className="line-through">{e.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          {t('cocktails.importWizard.back')}
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {isLoading ? t('cocktails.importWizard.importing') : t('cocktails.importWizard.confirmImport')}
        </button>
      </div>
    </div>
  );
}
