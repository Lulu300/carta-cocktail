import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../ui/classNames';
import Field from '../ui/Field';
import Input from '../ui/Input';
import type { TranslationForm } from '../../utils/translations';

interface TranslationFieldsProps {
  value: TranslationForm;
  onChange: (value: TranslationForm) => void;
  /** Shown in empty fields, usually the base name the entity falls back to. */
  placeholder?: string;
  defaultOpen?: boolean;
}

/** Collapsible French and English names of an entity. */
export default function TranslationFields({ value, onChange, placeholder, defaultOpen = false }: TranslationFieldsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const placeholderText = placeholder || '...';

  return (
    <div className="border border-line-strong rounded-lg p-3 space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="text-sm text-fg-muted flex items-center gap-2 w-full text-left"
      >
        <svg aria-hidden="true" className={cx('w-3 h-3 transition-transform', isOpen && 'rotate-90')} fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 6L14 10L6 14V6Z" />
        </svg>
        {t('common.translations')}
      </button>
      {isOpen && (
        <div id={panelId} className="space-y-2 pt-1">
          <Field label="Français">
            <Input
              value={value.fr}
              onChange={(event) => onChange({ ...value, fr: event.target.value })}
              placeholder={placeholderText}
            />
          </Field>
          <Field label="English">
            <Input
              value={value.en}
              onChange={(event) => onChange({ ...value, en: event.target.value })}
              placeholder={placeholderText}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
