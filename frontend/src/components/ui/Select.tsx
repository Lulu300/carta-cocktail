import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';
import { controlClasses, useFieldControlProps } from './fieldContext';

type SelectProps = ComponentPropsWithRef<'select'>;

export default function Select({
  className, id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, ...rest
}: SelectProps) {
  const fieldProps = useFieldControlProps({ id, required, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid });
  return <select className={cx(controlClasses, className)} {...fieldProps} {...rest} />;
}
