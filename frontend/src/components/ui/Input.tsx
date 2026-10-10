import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';
import { controlClasses, useFieldControlProps } from './fieldContext';

type InputProps = ComponentPropsWithRef<'input'>;

export default function Input({
  className, id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, ...rest
}: InputProps) {
  const fieldProps = useFieldControlProps({ id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid });
  return <input className={cx(controlClasses, className)} {...fieldProps} {...rest} />;
}
