import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cocktails as api } from '../../services/api';
import type { CocktailExportFormat, ImportPreviewResponse, EntityResolutionAction, Cocktail } from '../../types';
import ImportStepUpload from './ImportStepUpload';
import ImportStepResolve from './ImportStepResolve';
import ImportStepConfirm from './ImportStepConfirm';

type WizardStep = 'upload' | 'resolve' | 'confirm' | 'success' | 'error' | 'batchSummary';

interface ImportCocktailWizardProps {
  onClose: () => void;
}

interface ImportResult {
  name: string;
  success: boolean;
  id?: number;
}

function buildAutoResolutions(result: ImportPreviewResponse): Record<string, Record<string, EntityResolutionAction>> {
  const autoResolutions: Record<string, Record<string, EntityResolutionAction>> = {
    units: {},
    categories: {},
    bottles: {},
    ingredients: {},
  };

  for (const entity of result.units) {
    const key = entity.ref.abbreviation?.toLowerCase() || entity.ref.name?.toLowerCase() || '';
    if (entity.status === 'matched' && entity.existingMatch) {
      autoResolutions.units[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
    } else {
      autoResolutions.units[key] = {
        action: 'create',
        data: { name: entity.ref.name, abbreviation: entity.ref.abbreviation, conversionFactorToMl: entity.ref.conversionFactorToMl ?? null, nameTranslations: entity.ref.nameTranslations || null },
      };
    }
  }

  for (const entity of result.categories) {
    const key = entity.ref.name?.toLowerCase() || '';
    if (entity.status === 'matched' && entity.existingMatch) {
      autoResolutions.categories[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
    } else {
      autoResolutions.categories[key] = {
        action: 'create',
        data: { name: entity.ref.name, type: entity.ref.type || 'SPIRIT', desiredStock: entity.ref.desiredStock || 1, nameTranslations: entity.ref.nameTranslations || null },
      };
    }
  }

  for (const entity of result.bottles) {
    const key = entity.ref.name?.toLowerCase() || '';
    if (entity.status === 'matched' && entity.existingMatch) {
      autoResolutions.bottles[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
    } else {
      autoResolutions.bottles[key] = {
        action: 'create',
        data: { name: entity.ref.name, categoryName: entity.ref.categoryName || '', capacityMl: 700, remainingPercent: 100 },
      };
    }
  }

  for (const entity of result.ingredients) {
    const key = entity.ref.name?.toLowerCase() || '';
    if (entity.status === 'matched' && entity.existingMatch) {
      autoResolutions.ingredients[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
    } else {
      autoResolutions.ingredients[key] = {
        action: 'create',
        data: { name: entity.ref.name, icon: entity.ref.icon || null, nameTranslations: entity.ref.nameTranslations || null },
      };
    }
  }

  return autoResolutions;
}

export default function ImportCocktailWizard({ onClose }: ImportCocktailWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStep>('upload');
  const [recipe, setRecipe] = useState<CocktailExportFormat | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Record<string, EntityResolutionAction>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCocktail, setImportedCocktail] = useState<Cocktail | null>(null);

  // Batch state
  const [recipes, setRecipes] = useState<CocktailExportFormat[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const isBatch = recipes.length > 1;

  const handleRecipeLoaded = (data: CocktailExportFormat) => {
    setRecipe(data);
    setRecipes([data]);
    setCurrentIndex(0);
    setImportResults([]);
    setError(null);
  };

  const handleBatchLoaded = (loadedRecipes: CocktailExportFormat[]) => {
    setRecipes(loadedRecipes);
    setRecipe(loadedRecipes[0]);
    setCurrentIndex(0);
    setImportResults([]);
    setError(null);
  };

  const previewRecipe = async (recipeToPreview: CocktailExportFormat) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.importPreview(recipeToPreview);
      setPreview(result);
      setResolutions(buildAutoResolutions(result));
      setStep('resolve');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    if (!recipe) return;
    previewRecipe(recipe);
  };

  const advanceToNextRecipe = async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= recipes.length) {
      setStep('batchSummary');
      return;
    }
    setCurrentIndex(nextIndex);
    const nextRecipe = recipes[nextIndex];
    setRecipe(nextRecipe);
    setPreview(null);
    setResolutions({});
    setError(null);
    await previewRecipe(nextRecipe);
  };

  const handleConfirm = async () => {
    if (!recipe || !preview) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.importConfirm({ recipe, resolutions });
      setImportedCocktail(result);

      if (isBatch) {
        setImportResults((prev) => [...prev, { name: result.name, success: true, id: result.id }]);
        if (currentIndex < recipes.length - 1) {
          await advanceToNextRecipe();
        } else {
          // Need to set results before going to summary since advanceToNextRecipe won't be called
          setStep('batchSummary');
        }
      } else {
        setStep('success');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
      if (isBatch) {
        setImportResults((prev) => [...prev, { name: recipe.cocktail.name, success: false }]);
        setStep('error');
      } else {
        setStep('error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stepLabels = [
    { key: 'upload', label: '1' },
    { key: 'resolve', label: '2' },
    { key: 'confirm', label: '3' },
  ];

  const currentStepIndex = stepLabels.findIndex((s) => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{t('cocktails.importWizard.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Batch progress bar */}
        {isBatch && step !== 'batchSummary' && (
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
              <span>
                {t('cocktails.importWizard.batchProgress', {
                  current: currentIndex + 1,
                  total: recipes.length,
                  name: recipe?.cocktail.name,
                })}
              </span>
              <span>{importResults.length}/{recipes.length}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${(currentIndex / recipes.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step indicator */}
        {step !== 'success' && step !== 'error' && step !== 'batchSummary' && (
          <div className="flex items-center justify-center gap-2 px-6 pt-4">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= currentStepIndex
                    ? 'bg-amber-400 text-[#0f0f1a]'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {s.label}
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`w-12 h-0.5 ${i < currentStepIndex ? 'bg-amber-400' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {step === 'upload' && (
            <ImportStepUpload
              onRecipeLoaded={handleRecipeLoaded}
              onBatchLoaded={handleBatchLoaded}
              error={error}
              setError={setError}
              recipe={recipe}
              recipes={recipes}
              isLoading={isLoading}
              onNext={handlePreview}
            />
          )}

          {step === 'resolve' && preview && (
            <ImportStepResolve
              preview={preview}
              resolutions={resolutions}
              setResolutions={setResolutions}
              onBack={() => setStep(isBatch && currentIndex > 0 ? 'resolve' : 'upload')}
              onNext={() => setStep('confirm')}
            />
          )}

          {step === 'confirm' && preview && (
            <ImportStepConfirm
              preview={preview}
              resolutions={resolutions}
              isLoading={isLoading}
              onBack={() => setStep('resolve')}
              onConfirm={handleConfirm}
            />
          )}

          {step === 'success' && importedCocktail && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">🎉</div>
              <p className="text-lg font-semibold text-green-400">{t('cocktails.importWizard.success')}</p>
              <p className="text-gray-400">{importedCocktail.name}</p>
              <div className="flex justify-center gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
                >
                  {t('cocktails.importWizard.close')}
                </button>
                <Link
                  to={`/admin/cocktails/${importedCocktail.id}`}
                  onClick={onClose}
                  className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {t('cocktails.importWizard.editImported')}
                </Link>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">{isBatch ? '⚠️' : '❌'}</div>
              <p className="text-lg font-semibold text-red-400">
                {isBatch
                  ? t('cocktails.importWizard.batchItemError', { name: recipe?.cocktail.name })
                  : t('cocktails.importWizard.error')}
              </p>
              {error && <p className="text-sm text-gray-400">{error}</p>}
              <div className="flex justify-center gap-3 pt-4">
                {isBatch ? (
                  <>
                    <button
                      onClick={advanceToNextRecipe}
                      className="px-4 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
                    >
                      {currentIndex < recipes.length - 1
                        ? t('cocktails.importWizard.skipRecipe')
                        : t('cocktails.importWizard.close')}
                    </button>
                    <button
                      onClick={() => setStep('resolve')}
                      className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {t('cocktails.importWizard.tryAgain')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
                    >
                      {t('cocktails.importWizard.close')}
                    </button>
                    <button
                      onClick={() => setStep('resolve')}
                      className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {t('cocktails.importWizard.tryAgain')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 'batchSummary' && (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">📋</div>
              <p className="text-lg font-semibold text-amber-400">
                {t('cocktails.importWizard.batchComplete')}
              </p>
              <div className="text-left max-w-md mx-auto space-y-2">
                {importResults.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-sm px-3 py-2 rounded ${
                      result.success
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    <span>{result.success ? '✓' : '✗'}</span>
                    <span className="flex-1">{result.name}</span>
                    {result.success && result.id && (
                      <Link
                        to={`/admin/cocktails/${result.id}`}
                        onClick={onClose}
                        className="text-xs text-amber-400 hover:underline"
                      >
                        {t('common.edit')}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-400">
                {t('cocktails.importWizard.batchSummaryCount', {
                  success: importResults.filter((r) => r.success).length,
                  total: importResults.length,
                })}
              </p>
              <button
                onClick={onClose}
                className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {t('cocktails.importWizard.close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
