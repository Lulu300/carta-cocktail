import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CocktailExportFormat } from '../../types';
import Button from '../ui/Button';
import FileDropzone from './FileDropzone';

interface ImportStepUploadProps {
  recipes: CocktailExportFormat[];
  onLoaded: (recipes: CocktailExportFormat[]) => void;
  onNext: () => void;
}

/** The fields the wizard reads before the backend validates the whole recipe. */
function isRecipe(data: unknown): data is CocktailExportFormat {
  if (!data || typeof data !== 'object') return false;
  const { version, cocktail } = data as { version?: unknown; cocktail?: Record<string, unknown> };
  return version === 1
    && !!cocktail?.name
    && Array.isArray(cocktail.ingredients)
    && Array.isArray(cocktail.instructions);
}

function parseRecipe(text: string): CocktailExportFormat | null {
  try {
    const data: unknown = JSON.parse(text);
    return isRecipe(data) ? data : null;
  } catch {
    return null;
  }
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function ImportStepUpload({ recipes, onLoaded, onNext }: ImportStepUploadProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>();

  const loadJson = async (file: File) => {
    let text: string;
    try {
      text = await readAsText(file);
    } catch {
      setError(t('cocktails.importWizard.fileReadError'));
      return;
    }
    const recipe = parseRecipe(text);
    if (recipe) onLoaded([recipe]);
    else setError(t('cocktails.importWizard.invalidFile'));
  };

  const loadZip = async (file: File) => {
    try {
      // Loaded on demand: only ZIP imports need it
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const jsonNames = Object.keys(zip.files).filter((name) => name.endsWith('.json') && !zip.files[name].dir);
      if (jsonNames.length === 0) {
        setError(t('cocktails.importWizard.zipNoRecipes'));
        return;
      }
      const texts = await Promise.all(jsonNames.map((name) => zip.files[name].async('text')));
      // Invalid files of the archive are left out; the others are imported
      const validRecipes = texts.map(parseRecipe).filter((recipe) => recipe !== null);
      if (validRecipes.length === 0) setError(t('cocktails.importWizard.zipNoValidRecipes'));
      else onLoaded(validRecipes);
    } catch {
      setError(t('cocktails.importWizard.zipReadError'));
    }
  };

  const handleFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith('.zip')) loadZip(file);
    else loadJson(file);
  };

  const handleReject = () => {
    setError(t('cocktails.importWizard.invalidFile'));
  };

  const isBatch = recipes.length > 1;
  const recipe = recipes.length === 1 ? recipes[0] : null;

  return (
    <div className="space-y-6">
      <FileDropzone
        accept=".json,.zip"
        onFile={handleFile}
        onReject={handleReject}
        label={t('cocktails.importWizard.dropzone')}
        fileName={fileName}
      />

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {isBatch && (
        <div className="bg-canvas border border-gray-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">
            {t('cocktails.importWizard.batchPreview', { count: recipes.length })}
          </h3>
          <ul className="space-y-1.5">
            {recipes.map((r, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-center gap-2">
                <span className="text-accent font-mono text-xs w-5 text-right">#{i + 1}</span>
                <span className="font-serif">{r.cocktail.name}</span>
                <span className="text-gray-500 text-xs">
                  ({t('cocktails.importWizard.ingredientCount', { count: r.cocktail.ingredients.length })})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe && (
        <div className="bg-canvas border border-gray-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">
            {t('cocktails.importWizard.preview')}
          </h3>
          <div>
            <p className="text-xl font-bold font-serif text-accent">{recipe.cocktail.name}</p>
            {recipe.cocktail.description && (
              <p className="text-sm text-fg-muted mt-1 italic">{recipe.cocktail.description}</p>
            )}
          </div>
          <div className="flex gap-4 text-sm text-fg-muted">
            <span>{t('cocktails.importWizard.ingredientCount', { count: recipe.cocktail.ingredients.length })}</span>
            <span>{t('cocktails.importWizard.instructionCount', { count: recipe.cocktail.instructions.length })}</span>
          </div>
          {recipe.cocktail.tags && recipe.cocktail.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.cocktail.tags.map((tag, i) => (
                <span key={i} className="bg-accent/10 text-accent text-xs px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {recipes.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onNext}>{t('cocktails.importWizard.next')}</Button>
        </div>
      )}
    </div>
  );
}
