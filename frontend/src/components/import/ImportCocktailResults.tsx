import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { cx, focusRingClasses } from '../ui/classNames';
import WizardResult from './WizardResult';
import {
  canGoBack,
  currentRecipe,
  hasNextRecipe,
  isBatch,
  type CocktailImportState,
  type ImportResult,
} from './importCocktailReducer';

const editLinkClasses = cx(
  'inline-flex items-center rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-semibold px-4 py-2 transition-colors',
  focusRingClasses,
);

export function BatchProgress({ state }: { state: CocktailImportState }) {
  const { t } = useTranslation();
  const total = state.recipes.length;
  return (
    <div className="pb-4">
      <div className="flex items-center justify-between text-xs text-fg-muted mb-1.5">
        <span>
          {t('cocktails.importWizard.batchProgress', {
            current: state.currentIndex + 1,
            total,
            name: currentRecipe(state)?.cocktail.name,
          })}
        </span>
        <span>{Object.keys(state.results).length}/{total}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all duration-300 motion-reduce:transition-none" style={{ width: `${(state.currentIndex / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function ImportSuccess({ result, onClose }: { result: ImportResult | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <WizardResult
      variant="success"
      title={t('cocktails.importWizard.success')}
      message={result?.name}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cocktails.importWizard.close')}</Button>
          {result?.id !== undefined && (
            <Link to={`/admin/cocktails/${result.id}`} onClick={onClose} className={editLinkClasses}>
              {t('cocktails.importWizard.editImported')}
            </Link>
          )}
        </>
      }
    />
  );
}

interface ImportFailureProps {
  state: CocktailImportState;
  onBack: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** A failed preview or confirmation: the admin retries, skips the recipe or stops. */
export function ImportFailure({ state, onBack, onSkip, onRetry, onClose }: ImportFailureProps) {
  const { t } = useTranslation();
  const batch = isBatch(state);
  const title = batch
    ? t('cocktails.importWizard.batchItemError', { name: currentRecipe(state)?.cocktail.name })
    : t('cocktails.importWizard.error');
  return (
    <WizardResult
      variant="error"
      title={title}
      message={state.error ?? undefined}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cocktails.importWizard.close')}</Button>
          {canGoBack(state) && <Button variant="secondary" onClick={onBack}>{t('cocktails.importWizard.back')}</Button>}
          {batch && (
            <Button variant="secondary" onClick={onSkip}>
              {hasNextRecipe(state) ? t('cocktails.importWizard.skipRecipe') : t('cocktails.importWizard.showSummary')}
            </Button>
          )}
          <Button onClick={onRetry}>{t('cocktails.importWizard.tryAgain')}</Button>
        </>
      }
    />
  );
}

/** One line per recipe of the batch, imported or not. */
export function ImportBatchSummary({ state, onClose }: { state: CocktailImportState; onClose: () => void }) {
  const { t } = useTranslation();
  const results = state.recipes.map((recipe, index) => state.results[index] ?? { name: recipe.cocktail.name, success: false });
  const successCount = results.filter((result) => result.success).length;
  return (
    <WizardResult
      variant="summary"
      title={t('cocktails.importWizard.batchComplete')}
      message={t('cocktails.importWizard.batchSummaryCount', { success: successCount, total: results.length })}
      actions={<Button onClick={onClose}>{t('cocktails.importWizard.close')}</Button>}
    >
      <ul className="text-left max-w-md mx-auto space-y-2">
        {results.map((result, index) => (
          <li
            key={index}
            className={cx(
              'flex items-center gap-2 text-sm px-3 py-2 rounded',
              result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
            )}
          >
            <span aria-hidden="true">{result.success ? '✓' : '✗'}</span>
            <span className="flex-1">{result.name}</span>
            <span className="sr-only">
              {result.success ? t('cocktails.importWizard.resultImported') : t('cocktails.importWizard.resultNotImported')}
            </span>
            {result.success && result.id !== undefined && (
              <Link to={`/admin/cocktails/${result.id}`} onClick={onClose} className="text-xs text-accent hover:underline">
                {t('common.edit')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </WizardResult>
  );
}
