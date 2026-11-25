import { useTranslation } from 'react-i18next';
import type { BottleCategoryPreview, BottleCategoryResolution, Category, CategoryType, ImportMatchStatus } from '../../types';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { defaultCategoryData, existingCategoryFor } from './bottleImportResolutions';
import { isMissingCategoryType, resolutionKey } from './importResolutions';
import { existingMatchMessages } from './existingMatchMessages';
import ChoiceButton from './ChoiceButton';
import CategoryTypeSelect from './CategoryTypeSelect';
import { AmbiguousMatches, MatchBadge, MatchDot } from './MatchStatus';

interface BottleImportCategoryStepProps {
  categories: BottleCategoryPreview[];
  resolutions: Record<string, BottleCategoryResolution>;
  categoryTypes: CategoryType[];
  /** The categories a category to create may already exist as, ignoring case. */
  existingCategories: Category[];
  onChange: (key: string, resolution: BottleCategoryResolution) => void;
}

const STATUS_LABEL_KEYS: Record<ImportMatchStatus, string> = {
  matched: 'bottles.importWizard.matched',
  missing: 'bottles.importWizard.missing',
  ambiguous: 'importMatches.ambiguous',
};

/** Categories named by the file: use a matching one or create it. */
export default function BottleImportCategoryStep({
  categories,
  resolutions,
  categoryTypes,
  existingCategories,
  onChange,
}: BottleImportCategoryStepProps) {
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
          const isAmbiguous = entry.status === 'ambiguous';
          // An ambiguous category has no resolution until the admin picks one of its matches
          const choice = resolution?.action ?? (entry.status === 'missing' ? 'create' : 'use_existing');
          const match = entry.existingMatch;
          const nameMessages = resolution?.action === 'create'
            ? existingMatchMessages(t, existingCategoryFor(key, resolution, existingCategories), (category) => category.name)
            : {};
          return (
            <div key={key} className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <MatchDot status={entry.status} />
                <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                <MatchBadge status={entry.status} label={t(STATUS_LABEL_KEYS[entry.status])} />
              </div>
              {isAmbiguous && <AmbiguousMatches matches={entry.ambiguousMatches ?? []} />}
              <div className="flex gap-2">
                {(match || isAmbiguous) && (
                  <ChoiceButton
                    selected={choice === 'use_existing'}
                    // Of several matches, none is picked for the admin
                    onClick={() => onChange(key, { action: 'use_existing', existingId: match?.id })}
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
              {isAmbiguous && choice === 'use_existing' && (
                <Field label={t('cocktails.importWizard.existingEntity')} hideLabel>
                  <Select
                    value={resolution?.action === 'use_existing' ? resolution.existingId ?? '' : ''}
                    onChange={(e) => onChange(key, { action: 'use_existing', existingId: Number(e.target.value) })}
                  >
                    <option value="" disabled>{t('importMatches.pickMatch')}</option>
                    {(entry.ambiguousMatches ?? []).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {resolution?.action === 'create' && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('categories.name')} hideLabel hint={nameMessages.hint} error={nameMessages.error}>
                    <Input
                      value={resolution.data.name}
                      onChange={(e) => onChange(key, { ...resolution, data: { ...resolution.data, name: e.target.value } })}
                      placeholder={t('categories.name')}
                    />
                  </Field>
                  <Field
                    label={t('categories.type')}
                    hideLabel
                    error={isMissingCategoryType(resolution.data.type, categoryTypes) ? t('categories.typeRequired') : undefined}
                  >
                    <CategoryTypeSelect
                      value={resolution.data.type}
                      onChange={(type) => onChange(key, { ...resolution, data: { ...resolution.data, type } })}
                      categoryTypes={categoryTypes}
                    />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
