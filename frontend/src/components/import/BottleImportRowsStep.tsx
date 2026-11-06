import { useTranslation } from 'react-i18next';
import type { BottleRowPreview, BottleRowResolution } from '../../types';
import { cx } from '../ui/classNames';
import Select from '../ui/Select';
import { rowCategory, type CategoryOption } from './bottleImportResolutions';

interface BottleImportRowsStepProps {
  rows: BottleRowPreview[];
  resolutions: Record<string, BottleRowResolution>;
  categoryOptions: CategoryOption[];
  onChange: (index: string, resolution: BottleRowResolution) => void;
}

/** Bottles of the file: pick each one's category, or skip it. */
export default function BottleImportRowsStep({ rows, resolutions, categoryOptions, onChange }: BottleImportRowsStepProps) {
  const { t } = useTranslation();

  return (
    <section>
      <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-2">
        {t('bottles.importWizard.bottlesTitle')}
      </h3>
      <div className="space-y-2">
        {rows.map((entry, index) => {
          const key = String(index);
          const resolution = resolutions[key];
          const isSkipped = resolution?.action === 'skip';
          const category = rowCategory(entry.ref.categoryName, resolution);
          const needsCategory = entry.needsCategory && !category;
          return (
            <div
              key={key}
              className={cx(
                'border rounded-lg p-3 space-y-2',
                isSkipped && 'border-gray-700 opacity-50',
                !isSkipped && (needsCategory ? 'border-orange-500/40' : 'border-gray-700'),
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                <span className="text-xs text-fg-muted">{t('units.ml', { value: entry.ref.capacityMl })}</span>
                {entry.ref.quantity > 1 && (
                  <span className="bg-accent/20 text-accent text-xs font-bold px-2 py-0.5 rounded-full">
                    ×{entry.ref.quantity}
                  </span>
                )}
                {entry.potentialDuplicates.length > 0 && !isSkipped && (
                  <span className="bg-orange-500/10 text-orange-400 text-xs px-2 py-0.5 rounded">
                    {t('bottles.importWizard.duplicateFlag', { count: entry.potentialDuplicates.length })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Select
                  aria-label={t('bottles.category')}
                  value={category}
                  onChange={(e) => onChange(key, { action: 'import', categoryName: e.target.value })}
                  disabled={isSkipped}
                  className="flex-1"
                >
                  <option value="">{t('bottles.importWizard.pickCategory')}</option>
                  {categoryOptions.map((option) => (
                    <option key={`${option.isNew ? 'new' : 'existing'}-${option.name}`} value={option.name}>
                      {option.name}{option.isNew ? ` (${t('bottles.importWizard.willCreate')})` : ''}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  aria-pressed={isSkipped}
                  aria-label={isSkipped
                    ? t('bottles.importWizard.unskipRow', { name: entry.ref.name })
                    : t('bottles.importWizard.skipRow', { name: entry.ref.name })}
                  onClick={() => onChange(key, isSkipped ? { action: 'import', categoryName: category } : { action: 'skip' })}
                  className={cx(
                    'text-xs px-3 py-1.5 rounded-lg transition-colors border',
                    isSkipped ? 'bg-gray-400/10 text-gray-300 border-gray-500' : 'text-fg-muted border-gray-700 hover:border-gray-500',
                  )}
                >
                  {isSkipped ? t('bottles.importWizard.unskip') : t('bottles.importWizard.skip')}
                </button>
              </div>

              {needsCategory && !isSkipped && (
                <p className="text-xs text-orange-400">{t('bottles.importWizard.categoryRequired')}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
