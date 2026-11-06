import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryType, EntityResolutionAction, ImportEntityRef, ImportEntityResolution } from '../../types';
import IconPicker from '../ui/IconPicker';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { cx } from '../ui/classNames';
import {
  defaultCreateData,
  invalidCreateFields,
  parseNumberInput,
  referenceLabel,
  type CreateDataField,
  type ImportEntityType,
} from './importResolutions';
import { existingOptionLabel, type ExistingOption } from './useImportReferenceLists';
import ChoiceButton from './ChoiceButton';
import CategoryTypeSelect from './CategoryTypeSelect';
import { MatchBadge, MatchDot } from './MatchStatus';

type ResolutionChoice = EntityResolutionAction['action'];

interface ImportEntityRowProps {
  entity: ImportEntityResolution;
  type: ImportEntityType;
  existingOptions: ExistingOption[];
  resolution: EntityResolutionAction | undefined;
  onChange: (resolution: EntityResolutionAction) => void;
  allowSkip?: boolean;
  categoryTypes?: CategoryType[];
}

const FIELD_ERROR_KEYS: Record<CreateDataField, string> = {
  name: 'cocktails.importWizard.fieldRequired',
  abbreviation: 'cocktails.importWizard.fieldRequired',
  capacityMl: 'cocktails.importWizard.capacityInvalid',
  desiredStock: 'cocktails.importWizard.desiredStockInvalid',
};

/**
 * The entities the admin can pick. A bottle only maps to a bottle of the same
 * category. The backend's match stays listed while the lists are loading.
 */
function pickableOptions(entity: ImportEntityResolution, type: ImportEntityType, options: ExistingOption[]): ExistingOption[] {
  const categoryName = entity.ref.categoryName?.toLowerCase();
  const sameCategory = type === 'bottles' && categoryName
    ? options.filter((option) => option.category?.name?.toLowerCase() === categoryName)
    : options;
  const match = entity.existingMatch;
  if (!match || sameCategory.some((option) => option.id === match.id)) return sameCategory;
  return [match, ...sameCategory];
}

export default function ImportEntityRow({
  entity,
  type,
  existingOptions,
  resolution,
  onChange,
  allowSkip = false,
  categoryTypes = [],
}: ImportEntityRowProps) {
  const { t } = useTranslation();
  const isMatched = entity.status === 'matched';
  const [expanded, setExpanded] = useState(!isMatched);

  const choice: ResolutionChoice = resolution?.action ?? (isMatched ? 'use_existing' : 'create');
  const options = pickableOptions(entity, type, existingOptions);
  const createData = (resolution?.action === 'create' && resolution.data) || defaultCreateData(type, entity.ref);
  const invalidFields = invalidCreateFields(type, createData);
  const errorOf = (field: CreateDataField) => (invalidFields.includes(field) ? t(FIELD_ERROR_KEYS[field]) : undefined);

  const choose = (next: ResolutionChoice) => {
    // The button is disabled when `options` is empty
    if (next === 'use_existing') onChange({ action: 'use_existing', existingId: entity.existingMatch?.id ?? options[0].id });
    else if (next === 'create') onChange({ action: 'create', data: defaultCreateData(type, entity.ref) });
    else onChange({ action: 'skip' });
  };

  const updateCreateData = (field: keyof ImportEntityRef, value: ImportEntityRef[keyof ImportEntityRef]) => {
    onChange({ action: 'create', data: { ...createData, [field]: value } });
  };

  const textField = (field: 'name' | 'abbreviation', label: string) => (
    <Field label={label} error={errorOf(field)} required>
      <Input value={createData[field] ?? ''} onChange={(e) => updateCreateData(field, e.target.value)} />
    </Field>
  );

  const numberField = (field: 'capacityMl' | 'desiredStock', label: string, min: number) => (
    <Field label={label} error={errorOf(field)} required>
      <Input
        type="number"
        min={min}
        value={createData[field] ?? ''}
        onChange={(e) => updateCreateData(field, parseNumberInput(e.target.value))}
      />
    </Field>
  );

  const selectedId = resolution?.existingId ?? entity.existingMatch?.id ?? options[0]?.id ?? '';

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30"
      >
        <MatchDot matched={isMatched} />
        <span className="flex-1 text-sm font-medium">{referenceLabel(type, entity.ref)}</span>
        <MatchBadge
          matched={isMatched}
          label={isMatched ? t('cocktails.importWizard.matched') : t('cocktails.importWizard.missing')}
        />
        <svg aria-hidden="true" className={cx('w-4 h-4 text-fg-muted transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-700/50 space-y-3">
          <div className="flex gap-2">
            <ChoiceButton selected={choice === 'use_existing'} disabled={options.length === 0} onClick={() => choose('use_existing')}>
              {t('cocktails.importWizard.useExisting')}
            </ChoiceButton>
            <ChoiceButton selected={choice === 'create'} onClick={() => choose('create')}>
              {t('cocktails.importWizard.createNew')}
            </ChoiceButton>
            {allowSkip && (
              <ChoiceButton selected={choice === 'skip'} onClick={() => choose('skip')}>
                {t('cocktails.importWizard.skip')}
              </ChoiceButton>
            )}
          </div>

          {choice === 'use_existing' && (
            <Field label={t('cocktails.importWizard.existingEntity')}>
              <Select
                value={selectedId}
                onChange={(e) => onChange({ action: 'use_existing', existingId: Number(e.target.value) })}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{existingOptionLabel(type, option)}</option>
                ))}
              </Select>
            </Field>
          )}

          {choice === 'create' && (
            <div className="space-y-2">
              {textField('name', t(`${type}.name`))}
              {type === 'units' && textField('abbreviation', t('units.abbreviation'))}
              {type === 'categories' && (
                <>
                  <Field label={t('categories.type')}>
                    <CategoryTypeSelect
                      value={createData.type ?? ''}
                      onChange={(categoryType) => updateCreateData('type', categoryType)}
                      categoryTypes={categoryTypes}
                    />
                  </Field>
                  {numberField('desiredStock', t('cocktails.importWizard.desiredStock'), 0)}
                </>
              )}
              {type === 'bottles' && numberField('capacityMl', t('bottles.capacityMl'), 1)}
              {type === 'ingredients' && (
                <IconPicker
                  value={createData.icon ?? ''}
                  onChange={(icon) => updateCreateData('icon', icon || null)}
                />
              )}
            </div>
          )}

          {choice === 'skip' && (
            <p className="text-xs text-fg-muted italic">{t('cocktails.importWizard.skip')}</p>
          )}
        </div>
      )}
    </div>
  );
}
