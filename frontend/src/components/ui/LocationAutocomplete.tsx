import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ClearButton from './ClearButton';
import ComboboxListbox from './ComboboxListbox';
import Input from './Input';
import { useComboboxKeyboard } from './useComboboxKeyboard';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  locations: string[];
  /** Accessible name of the field, which has no visible label. */
  label: string;
  placeholder: string;
  className?: string;
}

export default function LocationAutocomplete({
  value, onChange, locations, label, placeholder, className = '',
}: LocationAutocompleteProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value) return locations;
    const lower = value.toLowerCase();
    return locations.filter((loc) => loc.toLowerCase().includes(lower));
  }, [value, locations]);

  const isListShown = open && filtered.length > 0;

  const select = (location: string) => {
    onChange(location);
    setOpen(false);
  };

  const combobox = useComboboxKeyboard({
    options: filtered,
    query: value,
    isOpen: isListShown,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    onSelect: select,
  });

  return (
    <div className={`relative ${className}`}>
      <Input
        {...combobox.inputProps}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label={label}
        placeholder={placeholder}
        className="text-sm pr-10"
      />
      {value && <ClearButton label={t('common.clear')} onClick={() => select('')} className="right-1" />}
      {isListShown && (
        <ComboboxListbox
          combobox={combobox}
          options={filtered}
          getKey={(location) => location}
          getLabel={(location) => location}
          onSelect={select}
          className="max-h-48"
        />
      )}
    </div>
  );
}
