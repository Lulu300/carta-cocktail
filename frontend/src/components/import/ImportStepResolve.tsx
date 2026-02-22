import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { categories as categoriesApi, bottles as bottlesApi, ingredients as ingredientsApi, units as unitsApi, categoryTypes as ctApi } from '../../services/api';
import type { ImportPreviewResponse, ImportEntityResolution, EntityResolutionAction, Category, CategoryType, Bottle, Ingredient, Unit } from '../../types';
import ImportEntityRow from './ImportEntityRow';

interface ImportStepResolveProps {
  preview: ImportPreviewResponse;
  resolutions: Record<string, Record<string, EntityResolutionAction>>;
  setResolutions: (r: Record<string, Record<string, EntityResolutionAction>>) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function ImportStepResolve({ preview, resolutions, setResolutions, onBack, onNext }: ImportStepResolveProps) {
  const { t } = useTranslation();
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allBottles, setAllBottles] = useState<Bottle[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allCategoryTypes, setAllCategoryTypes] = useState<CategoryType[]>([]);

  useEffect(() => {
    unitsApi.list().then(setAllUnits);
    categoriesApi.list().then(setAllCategories);
    bottlesApi.list().then(setAllBottles);
    ingredientsApi.list().then(setAllIngredients);
    ctApi.list().then(setAllCategoryTypes);
  }, []);

  const updateResolution = (type: string, key: string, resolution: EntityResolutionAction) => {
    setResolutions({
      ...resolutions,
      [type]: {
        ...(resolutions[type] || {}),
        [key]: resolution,
      },
    });
  };

  const getKey = (entity: ImportEntityResolution, type: string): string => {
    if (type === 'units') return entity.ref.abbreviation?.toLowerCase() || entity.ref.name?.toLowerCase() || '';
    return entity.ref.name?.toLowerCase() || '';
  };

  // Check if all missing entities have resolutions
  const missingCount = [
    ...preview.units.filter(e => e.status === 'missing'),
    ...preview.categories.filter(e => e.status === 'missing'),
    ...preview.bottles.filter(e => e.status === 'missing'),
    ...preview.ingredients.filter(e => e.status === 'missing'),
  ].length;

  const resolvedCount = [
    ...preview.units.filter(e => e.status === 'missing').filter(e => resolutions.units?.[getKey(e, 'units')]),
    ...preview.categories.filter(e => e.status === 'missing').filter(e => resolutions.categories?.[getKey(e, 'categories')]),
    ...preview.bottles.filter(e => e.status === 'missing').filter(e => resolutions.bottles?.[getKey(e, 'bottles')]),
    ...preview.ingredients.filter(e => e.status === 'missing').filter(e => resolutions.ingredients?.[getKey(e, 'ingredients')]),
  ].length;

  const allResolved = missingCount === resolvedCount;
  const totalEntities = preview.units.length + preview.categories.length + preview.bottles.length + preview.ingredients.length;

  const renderSection = (
    title: string,
    entities: ImportPreviewResponse['units'],
    type: 'units' | 'categories' | 'bottles' | 'ingredients',
    existingOptions: Array<{ id: number; name: string; abbreviation?: string; category?: { name?: string } }>,
    allowSkip?: boolean,
    categoryTypes?: CategoryType[],
  ) => {
    if (entities.length === 0) return null;
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {title} ({entities.length})
        </h3>
        <div className="space-y-2">
          {entities.map((entity, idx) => {
            const key = getKey(entity, type);
            return (
              <ImportEntityRow
                key={`${type}-${idx}`}
                entity={entity}
                entityType={type === 'units' ? 'unit' : type === 'categories' ? 'category' : type === 'bottles' ? 'bottle' : 'ingredient'}
                existingOptions={existingOptions}
                resolution={resolutions[type]?.[key]}
                onChange={(r) => updateResolution(type, key, r)}
                allowSkip={allowSkip}
                categoryTypes={categoryTypes}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cocktail info */}
      {preview.cocktail.alreadyExists && (
        <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg p-3 text-sm">
          {t('cocktails.importWizard.cocktailExists')}
        </div>
      )}

      {/* Status */}
      {totalEntities === 0 ? (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-sm">
          {t('cocktails.importWizard.noDependencies')}
        </div>
      ) : (
        <div className={`rounded-lg p-3 text-sm ${
          allResolved
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
        }`}>
          {allResolved
            ? t('cocktails.importWizard.allResolved')
            : t('cocktails.importWizard.unresolvedCount', { count: missingCount - resolvedCount })
          }
        </div>
      )}

      {/* Entity sections */}
      <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
        {renderSection(t('cocktails.importWizard.units'), preview.units, 'units', allUnits)}
        {renderSection(t('cocktails.importWizard.categories'), preview.categories, 'categories', allCategories, false, allCategoryTypes)}
        {renderSection(t('cocktails.importWizard.bottles'), preview.bottles, 'bottles', allBottles, true)}
        {renderSection(t('cocktails.importWizard.ingredients'), preview.ingredients, 'ingredients', allIngredients)}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          {t('cocktails.importWizard.back')}
        </button>
        <button
          onClick={onNext}
          disabled={!allResolved && missingCount > 0}
          className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {t('cocktails.importWizard.next')}
        </button>
      </div>
    </div>
  );
}
