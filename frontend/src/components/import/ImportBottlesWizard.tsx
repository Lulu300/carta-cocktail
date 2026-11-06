import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bottles as bottlesApi } from '../../services/api';
import { useCategories } from '../../queries/categories';
import { useCategoryTypes } from '../../queries/categoryTypes';
import type {
  BottleCategoryResolution,
  BottleImportConfirmResponse,
  BottleImportPreviewResponse,
  BottleImportResolutions,
  BottleRowResolution,
} from '../../types';
import Button from '../ui/Button';
import WizardModal from './WizardModal';
import WizardResult from './WizardResult';
import FileDropzone from './FileDropzone';
import BottleImportRowErrors from './BottleImportRowErrors';
import BottleImportCategoryStep from './BottleImportCategoryStep';
import BottleImportRowsStep from './BottleImportRowsStep';
import BottleImportConfirmStep from './BottleImportConfirmStep';
import { buildAutoBottleImportResolutions, categoryOptions, countRowsWithoutCategory } from './bottleImportResolutions';

type Step = 'upload' | 'resolve' | 'confirm' | 'success' | 'error';

interface ImportBottlesWizardProps {
  onClose: () => void;
  onImported?: () => void;
}

const STEP_INDICATOR_INDEX: Partial<Record<Step, number>> = { upload: 0, resolve: 1, confirm: 2 };

export default function ImportBottlesWizard({ onClose, onImported }: ImportBottlesWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BottleImportPreviewResponse | null>(null);
  const [resolutions, setResolutions] = useState<BottleImportResolutions>({ categories: {}, bottles: {} });
  const [result, setResult] = useState<BottleImportConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { data: existingCategories = [] } = useCategories();
  const { data: categoryTypes = [] } = useCategoryTypes();

  const selectFile = (selected: File) => {
    setError(null);
    setFile(selected);
  };

  const onPreview = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await bottlesApi.importPreview(file);
      setPreview(res);
      setResolutions(buildAutoBottleImportResolutions(res));
      setStep('resolve');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bottles.importWizard.previewError'));
    } finally {
      setIsLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!preview) return;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await bottlesApi.importConfirm({ payload: preview.payload, resolutions }));
      setStep('success');
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bottles.importWizard.error'));
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCategory = (key: string, resolution: BottleCategoryResolution) => {
    setResolutions((prev) => ({ ...prev, categories: { ...prev.categories, [key]: resolution } }));
  };

  const updateRow = (index: string, resolution: BottleRowResolution) => {
    setResolutions((prev) => ({ ...prev, bottles: { ...prev.bottles, [index]: resolution } }));
  };

  const rowsWithoutCategory = preview ? countRowsWithoutCategory(preview, resolutions) : 0;

  const footer = (step === 'resolve' || step === 'confirm') && (
    <>
      <Button variant="ghost" className="mr-auto" onClick={() => setStep(step === 'confirm' ? 'resolve' : 'upload')}>
        {t('bottles.importWizard.back')}
      </Button>
      {step === 'resolve' ? (
        <Button onClick={() => setStep('confirm')} disabled={rowsWithoutCategory > 0}>
          {t('bottles.importWizard.next')}
        </Button>
      ) : (
        <Button onClick={onConfirm} loading={isLoading} disabled={rowsWithoutCategory > 0}>
          {isLoading ? t('bottles.importWizard.importing') : t('bottles.importWizard.confirmImport')}
        </Button>
      )}
    </>
  );

  const closeButton = (
    <Button variant={step === 'success' ? 'primary' : 'ghost'} onClick={onClose}>
      {t('bottles.importWizard.close')}
    </Button>
  );

  return (
    <WizardModal
      title={t('bottles.importWizard.title')}
      steps={[t('bottles.importWizard.steps.upload'), t('bottles.importWizard.steps.resolve'), t('bottles.importWizard.steps.confirm')]}
      currentStep={STEP_INDICATOR_INDEX[step] ?? null}
      onClose={onClose}
      footer={footer || undefined}
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <FileDropzone
            accept=".json,.csv,.zip"
            onFile={selectFile}
            onReject={() => setError(t('bottles.importWizard.invalidFile'))}
            label={t('bottles.importWizard.dropzone')}
            fileName={file?.name}
          />
          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">{error}</div>
          )}
          {file && (
            <div className="flex justify-end">
              <Button onClick={onPreview} loading={isLoading}>
                {isLoading ? t('common.loading') : t('bottles.importWizard.next')}
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'resolve' && preview && (
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          <div className="bg-canvas border border-gray-700 rounded-lg p-3 text-sm flex gap-6 text-fg-muted">
            <span>{t('bottles.importWizard.summaryCategories', { count: preview.categories.length })}</span>
            <span>{t('bottles.importWizard.summaryBottles', { count: preview.bottles.length })}</span>
          </div>
          <BottleImportRowErrors errors={preview.errors} />
          <BottleImportCategoryStep
            categories={preview.categories}
            resolutions={resolutions.categories}
            categoryTypes={categoryTypes}
            onChange={updateCategory}
          />
          <BottleImportRowsStep
            rows={preview.bottles}
            resolutions={resolutions.bottles}
            categoryOptions={categoryOptions(existingCategories, preview, resolutions)}
            onChange={updateRow}
          />
        </div>
      )}

      {step === 'confirm' && preview && <BottleImportConfirmStep preview={preview} resolutions={resolutions} />}

      {step === 'success' && result && (
        <WizardResult variant="success" title={t('bottles.importWizard.successCount', { count: result.created.bottles })} actions={closeButton}>
          {result.duplicatesCreated > 0 && (
            <p className="text-sm text-orange-400">{t('bottles.importWizard.duplicatesCreatedRecap', { count: result.duplicatesCreated })}</p>
          )}
          {result.skippedNoCategory > 0 && (
            <p className="text-sm text-fg-muted">{t('bottles.importWizard.skippedRecap', { count: result.skippedNoCategory })}</p>
          )}
        </WizardResult>
      )}

      {step === 'error' && (
        <WizardResult variant="error" title={t('bottles.importWizard.error')} message={error ?? undefined} actions={closeButton} />
      )}
    </WizardModal>
  );
}
