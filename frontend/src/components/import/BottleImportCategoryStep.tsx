import { useTranslation } from 'react-i18next';
import type { BottleCategoryPreview, BottleCategoryResolution, CategoryType } from '../../types';
import Input from '../ui/Input';
import { defaultCategoryData } from './bottleImportResolutions';
import { resolutionKey } from './importResolutions';
import ChoiceButton from './ChoiceButton';
import CategoryTypeSelect from './CategoryTypeSelect';
import { MatchBadge, MatchDot } from './MatchStatus';

interface BottleImportCategoryStepProps {
  categories: BottleCategoryPreview[];
  resolutions: Record<string, BottleCategoryResolution>;
  categoryTypes: CategoryType[];
  onChange: (key: string, resolution: BottleCategoryResolution) => void;
}

/** Categories named by the file: use a matching one or create it. */
export default function BottleImportCategoryStep({ categories, resolutions, categoryTypes, onChange }: BottleImportCategoryStepProps) {
  const { t } = useTranslation();
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
          const isMatched = entry.status === 'matched';
          const choice = resolution?.action ?? (isMatched ? 'use_existing' : 'create');
          const match = entry.existingMatch;
          return (
            <div key={key} className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <MatchDot matched={isMatched} />
                <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                <MatchBadge
                  matched={isMatched}
                  label={isMatched ? t('bottles.importWizard.matched') : t('bottles.importWizard.missing')}
                />
              </div>
              <div className="flex gap-2">
                {match && (
                  <ChoiceButton
                    selected={choice === 'use_existing'}
                    onClick={() => onChange(key, { action: 'use_existing', existingId: match.id })}
                  >
                    {t('bottles.importWizard.useExisting')}
                  </ChoiceButton>
                )}
                <ChoiceButton
                  selected={choice === 'create'}
                  onClick={() => onChange(key, { action: 'create', data: defaultCategoryData(entry.ref) })}
                >
                  {t('bottles.importWizard.createNew')}
                </ChoiceButton>
              </div>
              {resolution?.action === 'create' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label={t('categories.name')}
                    value={resolution.data.name}
                    onChange={(e) => onChange(key, { ...resolution, data: { ...resolution.data, name: e.target.value } })}
                    placeholder={t('categories.name')}
                  />
                  <CategoryTypeSelect
                    aria-label={t('categories.type')}
                    value={resolution.data.type}
                    onChange={(type) => onChange(key, { ...resolution, data: { ...resolution.data, type } })}
                    categoryTypes={categoryTypes}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
