import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ClearButton from './ClearButton';
import Icon from './Icon';
import Input from './Input';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Name of the field, read by screen readers only: the placeholder is not a label. */
  label: string;
  placeholder?: string;
  className?: string;
}

export default function SearchInput({ value, onChange, label, placeholder, className = '' }: SearchInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t('common.search')}
        // The browser's own clear button would duplicate ours.
        className="pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && <ClearButton label={t('common.clearSearch')} onClick={() => onChange('')} fieldRef={inputRef} className="right-1" />}
    </div>
  );
}
