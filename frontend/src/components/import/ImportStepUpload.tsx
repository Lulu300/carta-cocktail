import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CocktailExportFormat } from '../../types';

interface ImportStepUploadProps {
  onRecipeLoaded: (recipe: CocktailExportFormat) => void;
  error: string | null;
  setError: (error: string | null) => void;
  recipe: CocktailExportFormat | null;
  isLoading: boolean;
  onNext: () => void;
}

export default function ImportStepUpload({ onRecipeLoaded, error, setError, recipe, isLoading, onNext }: ImportStepUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.version || !data.cocktail?.name) {
          setError(t('cocktails.importWizard.invalidFile'));
          return;
        }
        if (data.version !== 1) {
          setError(t('cocktails.importWizard.invalidVersion'));
          return;
        }
        onRecipeLoaded(data as CocktailExportFormat);
      } catch {
        setError(t('cocktails.importWizard.invalidFile'));
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-600 hover:border-amber-400/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
      >
        <div className="text-4xl mb-3">📄</div>
        <p className="text-gray-400 text-sm">{t('cocktails.importWizard.dropzone')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Preview */}
      {recipe && (
        <div className="bg-[#0f0f1a] border border-gray-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            {t('cocktails.importWizard.preview')}
          </h3>
          <div>
            <p className="text-xl font-bold font-serif text-amber-400">{recipe.cocktail.name}</p>
            {recipe.cocktail.description && (
              <p className="text-sm text-gray-400 mt-1 italic">{recipe.cocktail.description}</p>
            )}
          </div>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>{t('cocktails.importWizard.ingredientCount', { count: recipe.cocktail.ingredients?.length || 0 })}</span>
            <span>{t('cocktails.importWizard.instructionCount', { count: recipe.cocktail.instructions?.length || 0 })}</span>
          </div>
          {recipe.cocktail.tags && recipe.cocktail.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.cocktail.tags.map((tag, i) => (
                <span key={i} className="bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Next button */}
      {recipe && (
        <div className="flex justify-end">
          <button
            onClick={onNext}
            disabled={isLoading}
            className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {isLoading ? t('common.loading') : t('cocktails.importWizard.next')}
          </button>
        </div>
      )}
    </div>
  );
}
