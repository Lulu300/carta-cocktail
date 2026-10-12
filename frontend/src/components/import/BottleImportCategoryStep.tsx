import { useTranslation } from 'react-i18next';
import type { BottleCategoryPreview, BottleCategoryResolution, CategoryType } from '../../types';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { cx } from '../ui/classNames';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { defaultCategoryData } from './bottleImportResolutions';
import { resolutionKey } from './importResolutions';

interface BottleImportCategoryStepProps {
  categories: BottleCategoryPreview[];
  resolutions: Record<string, BottleCategoryResolution>;
  categoryTypes: CategoryType[];
  onChange: (key: string, resolution: BottleCategoryResolution) => void;
}

function choiceClasses(selected: boolean): string {
  return cx(
    'text-xs px-3 py-1.5 rounded-lg transition-colors border',
    selected ? 'bg-accent/10 text-accent border-accent/50' : 'text-fg-muted border-gray-700 hover:border-gray-500',
  );
}

/** Categories named by the file: use a matching one or create it. */
export default function BottleImportCategoryStep({ categories, resolutions, categoryTypes, onChange }: BottleImportCategoryStepProps) {
  const { t } = useTranslation();
  const localizedName = useLocalizedName();
  if (categories.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-2">
        {t('bottles.importWizard.categoriesTitle')}
      </h3>
      <div className="space-y-2">
        {categories.map((entry) => {
          const key = resolutionKey('categories', entry.ref);
          const resolution = resolutions[key];
          const choice = resolution?.action ?? (entry.status === 'matched' ? 'use_existing' : 'create');
          const match = entry.existingMatch;
          return (
            <div key={key} className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cx('w-2.5 h-2.5 rounded-full', entry.status === 'matched' ? 'bg-green-400' : 'bg-orange-400')} />
                <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                <span className={cx(
                  'text-xs px-2 py-0.5 rounded',
                  entry.status === 'matched' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400',
                )}>
                  {entry.status === 'matched' ? t('bottles.importWizard.matched') : t('bottles.importWizard.missing')}
                </span>
              </div>
              <div className="flex gap-2">
                {match && (
                  <button
                    type="button"
                    aria-pressed={choice === 'use_existing'}
                    onClick={() => onChange(key, { action: 'use_existing', existingId: match.id })}
                    className={choiceClasses(choice === 'use_existing')}
                  >
                    {t('bottles.importWizard.useExisting')}
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={choice === 'create'}
                  onClick={() => onChange(key, { action: 'create', data: defaultCategoryData(entry.ref) })}
                  className={choiceClasses(choice === 'create')}
                >
                  {t('bottles.importWizard.createNew')}
                </button>
              </div>
              {resolution?.action === 'create' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label={t('categories.name')}
                    value={resolution.data.name}
                    onChange={(e) => onChange(key, { ...resolution, data: { ...resolution.data, name: e.target.value } })}
                    placeholder={t('categories.name')}
                  />
                  <Select
                    aria-label={t('categories.type')}
                    value={resolution.data.type}
                    onChange={(e) => onChange(key, { ...resolution, data: { ...resolution.data, type: e.target.value } })}
                  >
                    {/* The file's type stays selectable while the types are loading */}
                    {!categoryTypes.some((ct) => ct.name === resolution.data.type) && (
                      <option value={resolution.data.type}>{resolution.data.type}</option>
                    )}
                    {categoryTypes.map((ct) => (
                      <option key={ct.name} value={ct.name}>{localizedName(ct)}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
