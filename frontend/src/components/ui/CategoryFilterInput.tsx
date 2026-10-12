import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import type { Category } from '../../types';
import ClearButton from './ClearButton';
import ComboboxListbox from './ComboboxListbox';
import Input from './Input';
import { cx } from './classNames';
import { useComboboxKeyboard } from './useComboboxKeyboard';

interface CategoryFilterInputProps {
  categories: Category[];
  value: string;
  selectedId: number | null;
  onChange: (text: string, selectedId: number | null) => void;
  /** Accessible name of the field, which has no visible label. */
  label: string;
  placeholder: string;
  className?: string;
}

export default function CategoryFilterInput({
  categories, value, selectedId, onChange, label, placeholder, className = '',
}: CategoryFilterInputProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [focused, setFocused] = useState(false);

  const matchingCategories = value.trim()
    ? categories.filter((c) => localize(c).toLowerCase().includes(value.toLowerCase()))
    : [];
  const isListShown = focused && matchingCategories.length > 0 && selectedId === null;

  const handleTextChange = (text: string) => {
    onChange(text, null);
    setFocused(true);
  };

  const handleSelect = (cat: Category) => {
    onChange(localize(cat), cat.id);
    setFocused(false);
  };

  const combobox = useComboboxKeyboard({
    options: matchingCategories,
    query: value,
    isOpen: isListShown,
    onOpen: () => setFocused(true),
    onClose: () => setFocused(false),
    onSelect: handleSelect,
  });

  return (
    <div className={`relative ${className}`}>
      <Input
        {...combobox.inputProps}
        type="text"
        value={value}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => setFocused(true)}
        aria-label={label}
        placeholder={placeholder}
        // The important flag (!) beats the field's default border colour.
        className={cx('text-sm pr-10', selectedId !== null && 'border-accent/50!')}
      />
      {value && <ClearButton label={t('common.clear')} onClick={() => onChange('', null)} className="right-1" />}
      {isListShown && (
        <ComboboxListbox
          combobox={combobox}
          options={matchingCategories}
          getKey={(cat) => cat.id}
          getLabel={localize}
          onSelect={handleSelect}
          className="max-h-60"
        />
      )}
    </div>
  );
}
