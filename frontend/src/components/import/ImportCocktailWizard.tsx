import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cocktails as api } from '../../services/api';
import type { CocktailExportFormat, ImportPreviewResponse, EntityResolutionAction, Cocktail } from '../../types';
import ImportStepUpload from './ImportStepUpload';
import ImportStepResolve from './ImportStepResolve';
import ImportStepConfirm from './ImportStepConfirm';

type WizardStep = 'upload' | 'resolve' | 'confirm' | 'success' | 'error';

interface ImportCocktailWizardProps {
  onClose: () => void;
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

  const handleRecipeLoaded = (data: CocktailExportFormat) => {
    setRecipe(data);
    setError(null);
  };

  const handlePreview = async () => {
    if (!recipe) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.importPreview(recipe);
      setPreview(result);

      // Auto-populate resolutions for matched entities
      const autoResolutions: Record<string, Record<string, EntityResolutionAction>> = {
        units: {},
        categories: {},
        bottles: {},
        ingredients: {},
      };

      for (const entity of result.units) {
        const key = entity.ref.abbreviation?.toLowerCase() || entity.ref.name?.toLowerCase();
        if (entity.status === 'matched' && entity.existingMatch) {
          autoResolutions.units[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
        } else {
          autoResolutions.units[key] = {
            action: 'create',
            data: { name: entity.ref.name, abbreviation: entity.ref.abbreviation, conversionFactorToMl: entity.ref.conversionFactorToMl ?? null },
          };
        }
      }

      for (const entity of result.categories) {
        const key = entity.ref.name?.toLowerCase();
        if (entity.status === 'matched' && entity.existingMatch) {
          autoResolutions.categories[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
        } else {
          autoResolutions.categories[key] = {
            action: 'create',
            data: { name: entity.ref.name, type: entity.ref.type || 'SPIRIT', desiredStock: entity.ref.desiredStock || 1 },
          };
        }
      }

      for (const entity of result.bottles) {
        const key = entity.ref.name?.toLowerCase();
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
        const key = entity.ref.name?.toLowerCase();
        if (entity.status === 'matched' && entity.existingMatch) {
          autoResolutions.ingredients[key] = { action: 'use_existing', existingId: entity.existingMatch.id };
        } else {
          autoResolutions.ingredients[key] = {
            action: 'create',
            data: { name: entity.ref.name, icon: entity.ref.icon || null },
          };
        }
      }

      setResolutions(autoResolutions);
      setStep('resolve');
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!recipe || !preview) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.importConfirm({ recipe, resolutions });
      setImportedCocktail(result);
      setStep('success');
    } catch (err: any) {
      setError(err.message || t('common.error'));
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const stepLabels = [
    { key: 'upload', label: '1' },
    { key: 'resolve', label: '2' },
    { key: 'confirm', label: '3' },
  ];

  const currentStepIndex = stepLabels.findIndex(s => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{t('cocktails.importWizard.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Step indicator */}
        {step !== 'success' && step !== 'error' && (
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
              error={error}
              setError={setError}
              recipe={recipe}
              isLoading={isLoading}
              onNext={handlePreview}
            />
          )}

          {step === 'resolve' && preview && (
            <ImportStepResolve
              preview={preview}
              resolutions={resolutions}
              setResolutions={setResolutions}
              onBack={() => setStep('upload')}
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
              <div className="text-5xl">❌</div>
              <p className="text-lg font-semibold text-red-400">{t('cocktails.importWizard.error')}</p>
              {error && <p className="text-sm text-gray-400">{error}</p>}
              <div className="flex justify-center gap-3 pt-4">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
