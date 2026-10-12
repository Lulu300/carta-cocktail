import { useTranslation } from 'react-i18next';
import type { BottleImportPreviewResponse, BottleImportResolutions } from '../../types';
import { countBottlesToCreate, countDuplicateRows, countRowsWithoutCategory } from './bottleImportResolutions';

interface BottleImportConfirmStepProps {
  preview: BottleImportPreviewResponse;
  resolutions: BottleImportResolutions;
}

/** What the confirmation creates, with the duplicates and the rows it would leave out. */
export default function BottleImportConfirmStep({ preview, resolutions }: BottleImportConfirmStepProps) {
  const { t } = useTranslation();
  const categoriesToCreate = Object.values(resolutions.categories).filter((r) => r.action === 'create').length;
  const skippedRows = Object.values(resolutions.bottles).filter((r) => r.action === 'skip').length;
  const duplicateRows = countDuplicateRows(preview, resolutions);
  const rowsWithoutCategory = countRowsWithoutCategory(preview, resolutions);

  const counts = [
    { label: t('bottles.importWizard.categoriesToCreate'), value: categoriesToCreate, className: 'text-accent' },
    { label: t('bottles.importWizard.bottlesToImport'), value: countBottlesToCreate(preview, resolutions), className: 'text-accent' },
    { label: t('bottles.importWizard.bottlesToSkip'), value: skippedRows, className: 'text-gray-500' },
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
        <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg p-3 text-xs space-y-1">
          <p className="font-semibold">{t('bottles.importWizard.duplicatesWarningTitle')}</p>
          <p>{t('bottles.importWizard.duplicatesWarningBody', { count: duplicateRows })}</p>
        </div>
      )}

      {rowsWithoutCategory > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-xs">
          {t('bottles.importWizard.unresolvedWarning', { count: rowsWithoutCategory })}
        </div>
      )}
    </div>
  );
}
