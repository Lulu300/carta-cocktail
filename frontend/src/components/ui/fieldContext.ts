import { createContext, useContext, type AriaAttributes } from 'react';
import { cx, focusRingClasses } from './classNames';

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

interface FieldControlProps {
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

/**
 * Merges the accessibility props provided by an enclosing `Field` into a
 * control's own props, so a control also works outside of a `Field`.
 * Inside a `Field`, the field id always wins: the label points to it.
 * Explicit `required` and `aria-invalid` props win; descriptions are combined.
 */
export function useFieldControlProps(props: FieldControlProps): FieldControlProps {
  const field = useContext(FieldContext);
  if (!field) return props;

  const describedBy = cx(field.describedBy, props['aria-describedby']);
  return {
    id: field.id,
    required: props.required ?? (field.required || undefined),
    'aria-describedby': describedBy || undefined,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  };
}

/** Base look of text inputs, selects and textareas. */
export const controlClasses = cx(
  'w-full bg-canvas border border-line-strong rounded-lg px-4 py-2 text-fg placeholder:text-fg-muted transition-colors',
  'aria-invalid:border-danger disabled:opacity-50 disabled:cursor-not-allowed',
  focusRingClasses,
);
