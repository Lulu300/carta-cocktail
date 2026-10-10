import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './classNames';
import { FieldContext } from './fieldContext';

interface FieldProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * Wraps a form control with its label, hint and error message. The control
 * (`Input`, `Select`, `Textarea`) reads the generated ids from context.
 */
export default function Field({ label, hint, error, required = false, children, className, ...rest }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = cx(hintId, errorId) || undefined;

  return (
    <div className={className} {...rest}>
      <label htmlFor={id} className="block text-sm text-fg-muted mb-1">
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      <FieldContext value={{ id, describedBy, invalid: Boolean(error), required }}>
        {children}
      </FieldContext>
      {hint && <p id={hintId} className="mt-1 text-xs text-fg-muted">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
