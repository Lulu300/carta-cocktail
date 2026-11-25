import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityResolutionAction, ImportEntityRef, ImportEntityResolution, ImportMatchStatus } from '../../types';
import IconPicker from '../ui/IconPicker';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { cx } from '../ui/classNames';
import {
  UNIQUE_FIELD,
  defaultCreateData,
  existingRowFor,
  invalidCreateFields,
  parseNumberInput,
  referenceLabel,
  type CreateDataField,
  type ExistingRows,
  type ImportEntityType,
} from './importResolutions';
import { existingOptionLabel, type ExistingOption } from './useImportReferenceLists';
import { existingMatchMessages } from './existingMatchMessages';
import ChoiceButton from './ChoiceButton';
import CategoryTypeSelect from './CategoryTypeSelect';
import { AmbiguousMatches, MatchBadge, MatchDot } from './MatchStatus';

type ResolutionChoice = EntityResolutionAction['action'];

interface ImportEntityRowProps {
  entity: ImportEntityResolution;
  type: ImportEntityType;
  existingOptions: ExistingOption[];
  resolution: EntityResolutionAction | undefined;
  onChange: (resolution: EntityResolutionAction) => void;
  allowSkip?: boolean;
  /** The category types, and the categories and units a new one must not duplicate. */
  existingRows?: ExistingRows;
}

const NO_EXISTING_ROWS: ExistingRows = { categoryTypes: [], categories: [], units: [] };

const STATUS_LABEL_KEYS: Record<ImportMatchStatus, string> = {
  matched: 'cocktails.importWizard.matched',
  missing: 'cocktails.importWizard.missing',
  ambiguous: 'importMatches.ambiguous',
};

const FIELD_ERROR_KEYS: Record<CreateDataField, string> = {
  name: 'cocktails.importWizard.fieldRequired',
  abbreviation: 'cocktails.importWizard.fieldRequired',
  type: 'categories.typeRequired',
  capacityMl: 'cocktails.importWizard.capacityInvalid',
  desiredStock: 'cocktails.importWizard.desiredStockInvalid',
};

/**
 * The entities the admin can pick. A bottle only maps to a bottle of the same
 * category. The backend's matches stay listed while the lists are loading.
 */
function pickableOptions(entity: ImportEntityResolution, type: ImportEntityType, options: ExistingOption[]): ExistingOption[] {
  const categoryName = entity.ref.categoryName?.toLowerCase();
  const sameCategory = type === 'bottles' && categoryName
    ? options.filter((option) => option.category?.name?.toLowerCase() === categoryName)
    : options;
  const matches = entity.existingMatch ? [entity.existingMatch] : entity.ambiguousMatches ?? [];
  const unlisted = matches.filter((match) => !sameCategory.some((option) => option.id === match.id));
  return [...unlisted, ...sameCategory];
}

export default function ImportEntityRow({
  entity,
  type,
  existingOptions,
  resolution,
  onChange,
  allowSkip = false,
  existingRows = NO_EXISTING_ROWS,
}: ImportEntityRowProps) {
  const { t } = useTranslation();
  const isMatched = entity.status === 'matched';
  const isAmbiguous = entity.status === 'ambiguous';
  const [expanded, setExpanded] = useState(!isMatched);

  // An ambiguous entity has no resolution until the admin picks one of its matches
  const choice: ResolutionChoice = resolution?.action ?? (isMatched || isAmbiguous ? 'use_existing' : 'create');
  const options = pickableOptions(entity, type, existingOptions);
  const createData = (resolution?.action === 'create' && resolution.data) || defaultCreateData(type, entity.ref);
  const invalidFields = invalidCreateFields(type, createData, existingRows);
  const uniqueField = UNIQUE_FIELD[type];
  const uniqueFieldMessages = existingMatchMessages(t, existingRowFor(type, createData, existingRows), (row) => existingOptionLabel(type, row));
  const errorOf = (field: CreateDataField) => {
    if (!invalidFields.includes(field)) return undefined;
    return (field === uniqueField && uniqueFieldMessages.error) || t(FIELD_ERROR_KEYS[field]);
  };

  const choose = (next: ResolutionChoice) => {
    // The button is disabled when `options` is empty. Of several matches, none is picked for the admin.
    if (next === 'use_existing') {
      onChange({ action: 'use_existing', existingId: isAmbiguous ? undefined : entity.existingMatch?.id ?? options[0].id });
    } else if (next === 'create') {
      onChange({ action: 'create', data: defaultCreateData(type, entity.ref) });
    } else {
      onChange({ action: 'skip' });
    }
  };

  const updateCreateData = (field: keyof ImportEntityRef, value: ImportEntityRef[keyof ImportEntityRef]) => {
    onChange({ action: 'create', data: { ...createData, [field]: value } });
  };

  const textField = (field: 'name' | 'abbreviation', label: string) => (
    <Field label={label} hint={field === uniqueField ? uniqueFieldMessages.hint : undefined} error={errorOf(field)} required>
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

  // Empty until the admin picks one of several matches
  const selectedId = resolution?.existingId ?? (isAmbiguous ? '' : entity.existingMatch?.id ?? options[0]?.id ?? '');

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30"
      >
        <MatchDot status={entity.status} />
        <span className="flex-1 text-sm font-medium">{referenceLabel(type, entity.ref)}</span>
        <MatchBadge status={entity.status} label={t(STATUS_LABEL_KEYS[entity.status])} />
        <svg aria-hidden="true" className={cx('w-4 h-4 text-fg-muted transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-700/50 space-y-3">
          {isAmbiguous && <AmbiguousMatches matches={entity.ambiguousMatches ?? []} />}
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
                {selectedId === '' && <option value="" disabled>{t('importMatches.pickMatch')}</option>}
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
                  <Field label={t('categories.type')} error={errorOf('type')}>
                    <CategoryTypeSelect
                      value={createData.type ?? ''}
                      onChange={(categoryType) => updateCreateData('type', categoryType)}
                      categoryTypes={existingRows.categoryTypes}
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
