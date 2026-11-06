import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { cocktails as api } from '../../services/api';
import type { CocktailExportFormat } from '../../types';
import { useInvalidateQueries } from '../../queries/crud';
import Spinner from '../ui/Spinner';
import WizardModal from './WizardModal';
import ImportStepUpload from './ImportStepUpload';
import ImportStepResolve from './ImportStepResolve';
import ImportStepConfirm from './ImportStepConfirm';
import { BatchProgress, ImportBatchSummary, ImportFailure, ImportSuccess } from './ImportCocktailResults';
import {
  canGoBack,
  currentRecipe,
  importCocktailReducer,
  initialCocktailImportState,
  isBatch,
  type CocktailImportStep,
} from './importCocktailReducer';
import { createsEntities, type ImportResolutions } from './importResolutions';
import { IMPORT_REFERENCE_KEYS, useImportReferenceLists } from './useImportReferenceLists';

interface ConfirmVariables {
  recipe: CocktailExportFormat;
  resolutions: ImportResolutions;
}

interface ImportCocktailWizardProps {
  onClose: () => void;
}

// Position in the 1-2-3 indicator; result screens hide it
const STEP_INDICATOR_INDEX: Partial<Record<CocktailImportStep, number>> = {
  upload: 0,
  previewing: 1,
  resolve: 1,
  confirm: 2,
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ImportCocktailWizard({ onClose }: ImportCocktailWizardProps) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(importCocktailReducer, initialCocktailImportState);
  const lists = useImportReferenceLists();
  const invalidateQueries = useInvalidateQueries();
  const confirmMutation = useMutation({
    mutationFn: (variables: ConfirmVariables) => api.importConfirm(variables),
    // Here rather than in mutate(): it still runs if the wizard is closed meanwhile.
    // The next recipes of a batch must be able to pick what this one created.
    onSuccess: (_cocktail, { resolutions }) => {
      if (createsEntities(resolutions)) invalidateQueries(IMPORT_REFERENCE_KEYS);
    },
  });
  const recipe = currentRecipe(state);
  const fallbackError = t('common.error');

  // The reducer asks for the preview of the current recipe; the request is sent here
  useEffect(() => {
    if (state.step !== 'previewing' || !recipe) return;
    let cancelled = false;
    api.importPreview(recipe).then(
      (preview) => {
        if (!cancelled) dispatch({ type: 'PREVIEW_OK', preview });
      },
      (error: unknown) => {
        if (!cancelled) dispatch({ type: 'PREVIEW_FAILED', message: messageOf(error, fallbackError) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.step, recipe, fallbackError]);

  const handleConfirm = () => {
    if (!recipe || confirmMutation.isPending) return;
    confirmMutation.mutate({ recipe, resolutions: state.resolutions }, {
      onSuccess: (cocktail) => dispatch({ type: 'CONFIRM_OK', cocktail }),
      onError: (error) => dispatch({ type: 'CONFIRM_FAILED', message: messageOf(error, fallbackError) }),
    });
  };

  const goBack = () => dispatch({ type: 'BACK' });

  const renderStep = () => {
    switch (state.step) {
      case 'upload':
        return (
          <ImportStepUpload
            recipes={state.recipes}
            onLoaded={(recipes) => dispatch({ type: 'LOADED', recipes })}
            onNext={() => dispatch({ type: 'PREVIEW_REQUESTED' })}
          />
        );
      case 'previewing':
        return <div className="flex justify-center py-12"><Spinner /></div>;
      case 'resolve':
        return state.preview && (
          <ImportStepResolve
            preview={state.preview}
            resolutions={state.resolutions}
            onChange={(resolutions) => dispatch({ type: 'RESOLUTIONS_CHANGED', resolutions })}
            lists={lists}
            canGoBack={canGoBack(state)}
            onBack={goBack}
            onNext={() => dispatch({ type: 'NEXT' })}
          />
        );
      case 'confirm':
        return state.preview && (
          <ImportStepConfirm
            preview={state.preview}
            resolutions={state.resolutions}
            lists={lists}
            isLoading={confirmMutation.isPending}
            onBack={goBack}
            onConfirm={handleConfirm}
          />
        );
      case 'success':
        return <ImportSuccess result={state.results[state.currentIndex]} onClose={onClose} />;
      case 'error':
        return (
          <ImportFailure
            state={state}
            onBack={goBack}
            onSkip={() => dispatch({ type: 'SKIP' })}
            onRetry={() => dispatch({ type: 'RETRY' })}
            onClose={onClose}
          />
        );
      case 'batchSummary':
        return <ImportBatchSummary state={state} onClose={onClose} />;
    }
  };

  return (
    <WizardModal
      title={t('cocktails.importWizard.title')}
      steps={[
        t('cocktails.importWizard.steps.upload'),
        t('cocktails.importWizard.steps.resolve'),
        t('cocktails.importWizard.steps.confirm'),
      ]}
      currentStep={STEP_INDICATOR_INDEX[state.step] ?? null}
      onClose={onClose}
    >
      {isBatch(state) && state.step !== 'batchSummary' && <BatchProgress state={state} />}
      {renderStep()}
    </WizardModal>
  );
}
