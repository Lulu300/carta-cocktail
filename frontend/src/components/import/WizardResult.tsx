import type { ReactNode } from 'react';
import { cx } from '../ui/classNames';

type ResultVariant = 'success' | 'error' | 'summary';

interface WizardResultProps {
  variant: ResultVariant;
  title: string;
  message?: string;
  /** Extra content between the message and the actions, e.g. a list of results. */
  children?: ReactNode;
  actions: ReactNode;
}

const VARIANT_ICONS: Record<ResultVariant, string> = {
  success: '🎉',
  error: '❌',
  summary: '📋',
};

const VARIANT_TITLE_CLASSES: Record<ResultVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  summary: 'text-accent',
};

/** Last screen of an import wizard: outcome, details and what to do next. */
export default function WizardResult({ variant, title, message, children, actions }: WizardResultProps) {
  return (
    <div className="text-center py-6 space-y-4" role={variant === 'error' ? 'alert' : 'status'}>
      <div aria-hidden="true" className="text-5xl">{VARIANT_ICONS[variant]}</div>
      <p className={cx('text-lg font-semibold', VARIANT_TITLE_CLASSES[variant])}>{title}</p>
      {message && <p className="text-sm text-fg-muted">{message}</p>}
      {children}
      <div className="flex flex-wrap justify-center gap-3 pt-2">{actions}</div>
    </div>
  );
}
