import type { ReactNode } from 'react';
import { cx } from '../ui/classNames';

interface ChoiceButtonProps {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** One of the choices for an imported entity: use an existing one, create it, skip it. */
export default function ChoiceButton({ selected, disabled, onClick, children }: ChoiceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'text-xs px-3 py-1.5 rounded-lg transition-colors border disabled:opacity-50 disabled:cursor-not-allowed',
        selected ? 'bg-accent/10 text-accent border-accent/50' : 'text-fg-muted border-gray-700 hover:border-gray-500',
      )}
    >
      {children}
    </button>
  );
}
