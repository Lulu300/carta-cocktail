import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';
import { controlClasses, useFieldControlProps } from './fieldContext';

type TextareaProps = ComponentPropsWithRef<'textarea'>;

export default function Textarea({
  className, id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, ...rest
}: TextareaProps) {
  const fieldProps = useFieldControlProps({ id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid });
  return <textarea className={cx(controlClasses, className)} {...fieldProps} {...rest} />;
}
