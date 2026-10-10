import type { ComponentPropsWithRef } from 'react';
import { cx } from './classNames';

type CardPadding = 'none' | 'md';

interface CardProps extends ComponentPropsWithRef<'div'> {
  as?: 'div' | 'section';
  padding?: CardPadding;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  md: 'p-6',
};

export default function Card({ as: Component = 'div', padding = 'md', className, ...rest }: CardProps) {
  return (
    <Component
      className={cx('bg-surface border border-line rounded-xl', PADDING_CLASSES[padding], className)}
      {...rest}
    />
  );
}
