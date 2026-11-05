import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { datePattern, formatDate, parseDateInput } from '../../utils/dates';
import Field from './Field';
import Input from './Input';

interface DateInputProps {
  label: string;
  /** ISO date (`yyyy-mm-dd`), empty for no date. */
  value: string;
  /** Called with an ISO date, or an empty string when the field is cleared; never with an invalid date. */
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

/** What the typed text stands for: an ISO date, '' for an empty field, null for an invalid date. */
function readText(text: string, language: string): string | null {
  return text.trim() === '' ? '' : parseDateInput(text, language);
}

/**
 * A date field in the format of the app's language, whatever the browser's language
 * (`<input type="date">` follows the browser). The value stays ISO: only the text changes.
 * An invalid date blocks the form submission and shows a translated error.
 */
export default function DateInput({ label, value, onChange, required, className }: DateInputProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatDate(value, language));
  const [shown, setShown] = useState({ value, language });
  const [errorVisible, setErrorVisible] = useState(false);

  // A new value from the form (another bottle) or a new language: show the date in its format.
  // Text that already stands for the value is kept as typed (`3/12/2024` is not rewritten).
  if (shown.value !== value || shown.language !== language) {
    setShown({ value, language });
    if (readText(text, language) !== value) setText(formatDate(value, language));
  }

  const pattern = datePattern(language, t);
  const isInvalid = readText(text, language) === null;
  const errorMessage = t('dates.invalid', { pattern });

  // The browser refuses to submit the form and announces the message on the field.
  useEffect(() => {
    inputRef.current?.setCustomValidity(isInvalid ? errorMessage : '');
  }, [isInvalid, errorMessage]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    const date = readText(event.target.value, language);
    if (date !== null) onChange(date);
  };

  return (
    <Field
      label={label}
      required={required}
      hint={t('dates.format', { pattern })}
      error={isInvalid && errorVisible ? errorMessage : undefined}
      className={className}
    >
      <Input
        ref={inputRef}
        value={text}
        placeholder={pattern}
        autoComplete="off"
        onChange={handleChange}
        // Not while typing: the date is incomplete until the last digit
        onBlur={() => setErrorVisible(true)}
        onInvalid={() => setErrorVisible(true)}
      />
    </Field>
  );
}
