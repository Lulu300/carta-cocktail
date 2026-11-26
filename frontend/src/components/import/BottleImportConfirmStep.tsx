import { useTranslation } from 'react-i18next';
import type { BottleImportPreviewResponse, BottleImportResolutions, Category } from '../../types';
import { countBottlesToCreate, countCategoriesToCreate, countDuplicateRows, countRowsWithoutCategory } from './bottleImportResolutions';
import Alert from '../ui/Alert';

interface BottleImportConfirmStepProps {
  preview: BottleImportPreviewResponse;
  resolutions: BottleImportResolutions;
  existingCategories: Category[];
}

/** What the confirmation creates, with the duplicates and the rows it would leave out. */
export default function BottleImportConfirmStep({ preview, resolutions, existingCategories }: BottleImportConfirmStepProps) {
  const { t } = useTranslation();
  const categoriesToCreate = countCategoriesToCreate(resolutions, existingCategories);
  const skippedRows = Object.values(resolutions.bottles).filter((r) => r.action === 'skip').length;
  const duplicateRows = countDuplicateRows(preview, resolutions);
  const rowsWithoutCategory = countRowsWithoutCategory(preview, resolutions);

  const counts = [
    { label: t('bottles.importWizard.categoriesToCreate'), value: categoriesToCreate, className: 'text-accent' },
    { label: t('bottles.importWizard.bottlesToImport'), value: countBottlesToCreate(preview, resolutions), className: 'text-accent' },
    { label: t('bottles.importWizard.bottlesToSkip'), value: skippedRows, className: 'text-fg-muted' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-canvas border border-gray-700 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">
          {t('bottles.importWizard.confirmTitle')}
        </h3>
        <ul className="text-sm space-y-1.5">
          {counts.map((count) => (
            <li key={count.label} className="flex justify-between">
              <span className="text-fg-muted">{count.label}</span>
              <span className={`font-mono ${count.className}`}>{count.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {duplicateRows > 0 && (
        <Alert tone="warning" size="xs" title={t('bottles.importWizard.duplicatesWarningTitle')}>
          <p>{t('bottles.importWizard.duplicatesWarningBody', { count: duplicateRows })}</p>
        </Alert>
      )}

      {rowsWithoutCategory > 0 && (
        <Alert tone="danger" size="xs">
          {t('bottles.importWizard.unresolvedWarning', { count: rowsWithoutCategory })}
        </Alert>
      )}
    </div>
  );
}
