import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryType, EntityResolutionAction, ImportEntityRef, ImportEntityResolution } from '../../types';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import IconPicker from '../ui/IconPicker';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { cx } from '../ui/classNames';
import {
  defaultCreateData,
  invalidCreateFields,
  parseNumberInput,
  type CreateDataField,
  type ImportEntityType,
} from './importResolutions';
import { existingOptionLabel, type ExistingOption } from './useImportReferenceLists';

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

function ChoiceButton({ selected, disabled, onClick, children }: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'text-xs px-3 py-1.5 rounded-lg transition-colors border disabled:opacity-50 disabled:cursor-not-allowed',
        selected ? 'bg-accent/10 text-accent border-accent/50' : 'text-fg-muted border-gray-700 hover:border-gray-500',
      )}
    >
      {children}
    </button>
  );
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
  const localizedName = useLocalizedName();
  const [expanded, setExpanded] = useState(entity.status === 'missing');

  const choice: ResolutionChoice = resolution?.action ?? (entity.status === 'matched' ? 'use_existing' : 'create');
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

  const title = type === 'units' ? `${entity.ref.name} (${entity.ref.abbreviation})` : entity.ref.name;
  const selectedId = resolution?.existingId ?? entity.existingMatch?.id ?? options[0]?.id ?? '';

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30"
      >
        <span aria-hidden="true" className={cx('w-2.5 h-2.5 rounded-full flex-shrink-0', entity.status === 'matched' ? 'bg-green-400' : 'bg-orange-400')} />
        <span className="flex-1 text-sm font-medium">{title}</span>
        <span className={cx(
          'text-xs px-2 py-0.5 rounded',
          entity.status === 'matched' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400',
        )}>
          {entity.status === 'matched' ? t('cocktails.importWizard.matched') : t('cocktails.importWizard.missing')}
        </span>
        <svg aria-hidden="true" className={cx('w-4 h-4 text-fg-muted transition-transform', expanded && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <Select value={createData.type ?? ''} onChange={(e) => updateCreateData('type', e.target.value)}>
                      {/* The file's type stays selectable while the types are loading */}
                      {!categoryTypes.some((ct) => ct.name === createData.type) && (
                        <option value={createData.type}>{createData.type}</option>
                      )}
                      {categoryTypes.map((ct) => (
                        <option key={ct.name} value={ct.name}>{localizedName(ct)}</option>
                      ))}
                    </Select>
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
