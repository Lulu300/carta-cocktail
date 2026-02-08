import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityResolutionAction, ImportEntityResolution } from '../../types';

interface ImportEntityRowProps {
  entity: ImportEntityResolution;
  entityType: 'unit' | 'category' | 'bottle' | 'ingredient';
  existingOptions: { id: number; name: string; [key: string]: any }[];
  resolution: EntityResolutionAction | undefined;
  onChange: (resolution: EntityResolutionAction) => void;
  allowSkip?: boolean;
}

export default function ImportEntityRow({
  entity,
  entityType,
  existingOptions,
  resolution,
  onChange,
  allowSkip,
}: ImportEntityRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(entity.status === 'missing');

  const action = resolution?.action || (entity.status === 'matched' ? 'use_existing' : 'create');

  const getDisplayName = () => {
    if (entityType === 'unit') return `${entity.ref.name} (${entity.ref.abbreviation})`;
    return entity.ref.name;
  };

  const handleActionChange = (newAction: 'use_existing' | 'create' | 'skip') => {
    if (newAction === 'use_existing') {
      const matchId = entity.existingMatch?.id || existingOptions[0]?.id;
      onChange({ action: 'use_existing', existingId: matchId });
    } else if (newAction === 'create') {
      onChange({ action: 'create', data: buildDefaultCreateData() });
    } else {
      onChange({ action: 'skip' });
    }
  };

  const buildDefaultCreateData = () => {
    switch (entityType) {
      case 'unit':
        return {
          name: entity.ref.name,
          abbreviation: entity.ref.abbreviation,
          conversionFactorToMl: entity.ref.conversionFactorToMl ?? null,
        };
      case 'category':
        return {
          name: entity.ref.name,
          type: entity.ref.type || 'SPIRIT',
          desiredStock: entity.ref.desiredStock || 1,
        };
      case 'bottle':
        return {
          name: entity.ref.name,
          categoryName: entity.ref.categoryName || '',
          capacityMl: 700,
          remainingPercent: 100,
        };
      case 'ingredient':
        return {
          name: entity.ref.name,
          icon: entity.ref.icon || null,
        };
      default:
        return entity.ref;
    }
  };

  const updateCreateData = (field: string, value: any) => {
    onChange({
      action: 'create',
      data: { ...(resolution?.data || buildDefaultCreateData()), [field]: value },
    });
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          entity.status === 'matched' ? 'bg-green-400' : 'bg-orange-400'
        }`} />
        <span className="flex-1 text-sm font-medium">{getDisplayName()}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${
          entity.status === 'matched'
            ? 'bg-green-500/10 text-green-400'
            : 'bg-orange-500/10 text-orange-400'
        }`}>
          {entity.status === 'matched' ? t('cocktails.importWizard.matched') : t('cocktails.importWizard.missing')}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-700/50 space-y-3">
          {/* Action selector */}
          <div className="flex gap-2">
            <button
              onClick={() => handleActionChange('use_existing')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                action === 'use_existing'
                  ? 'bg-amber-400/10 text-amber-400 border border-amber-400/50'
                  : 'text-gray-400 border border-gray-700 hover:border-gray-500'
              }`}
            >
              {t('cocktails.importWizard.useExisting')}
            </button>
            <button
              onClick={() => handleActionChange('create')}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                action === 'create'
                  ? 'bg-amber-400/10 text-amber-400 border border-amber-400/50'
                  : 'text-gray-400 border border-gray-700 hover:border-gray-500'
              }`}
            >
              {t('cocktails.importWizard.createNew')}
            </button>
            {allowSkip && (
              <button
                onClick={() => handleActionChange('skip')}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  action === 'skip'
                    ? 'bg-gray-400/10 text-gray-300 border border-gray-500'
                    : 'text-gray-400 border border-gray-700 hover:border-gray-500'
                }`}
              >
                {t('cocktails.importWizard.skip')}
              </button>
            )}
          </div>

          {/* Use existing dropdown */}
          {action === 'use_existing' && (
            <select
              value={resolution?.existingId || entity.existingMatch?.id || ''}
              onChange={(e) => onChange({ action: 'use_existing', existingId: parseInt(e.target.value) })}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              {existingOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {entityType === 'unit' ? `${opt.name} (${opt.abbreviation})` : opt.name}
                </option>
              ))}
            </select>
          )}

          {/* Create form */}
          {action === 'create' && (
            <div className="space-y-2">
              {entityType === 'unit' && (
                <>
                  <input
                    value={resolution?.data?.name || entity.ref.name}
                    onChange={(e) => updateCreateData('name', e.target.value)}
                    placeholder={t('units.name')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    value={resolution?.data?.abbreviation || entity.ref.abbreviation}
                    onChange={(e) => updateCreateData('abbreviation', e.target.value)}
                    placeholder={t('units.abbreviation')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </>
              )}
              {entityType === 'category' && (
                <>
                  <input
                    value={resolution?.data?.name || entity.ref.name}
                    onChange={(e) => updateCreateData('name', e.target.value)}
                    placeholder={t('categories.name')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <select
                    value={resolution?.data?.type || entity.ref.type || 'SPIRIT'}
                    onChange={(e) => updateCreateData('type', e.target.value)}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="SPIRIT">{t('categories.spirit')}</option>
                    <option value="SYRUP">{t('categories.syrup')}</option>
                  </select>
                </>
              )}
              {entityType === 'bottle' && (
                <>
                  <input
                    value={resolution?.data?.name || entity.ref.name}
                    onChange={(e) => updateCreateData('name', e.target.value)}
                    placeholder={t('bottles.name')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="number"
                    value={resolution?.data?.capacityMl ?? 700}
                    onChange={(e) => updateCreateData('capacityMl', parseInt(e.target.value))}
                    placeholder={t('bottles.capacityMl')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </>
              )}
              {entityType === 'ingredient' && (
                <>
                  <input
                    value={resolution?.data?.name || entity.ref.name}
                    onChange={(e) => updateCreateData('name', e.target.value)}
                    placeholder={t('ingredients.name')}
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    value={resolution?.data?.icon || entity.ref.icon || ''}
                    onChange={(e) => updateCreateData('icon', e.target.value || null)}
                    placeholder="Icon (emoji)"
                    className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </>
              )}
            </div>
          )}

          {/* Skip info */}
          {action === 'skip' && (
            <p className="text-xs text-gray-500 italic">
              {t('cocktails.importWizard.skip')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
