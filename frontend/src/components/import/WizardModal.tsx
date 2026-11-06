import type { ReactNode } from 'react';
import Modal from '../ui/Modal';
import { cx } from '../ui/classNames';

interface WizardModalProps {
  title: string;
  /** Name of each step, read by screen readers; the indicator shows its number. */
  steps: string[];
  /** Index of the current step, or null to hide the indicator (result screens). */
  currentStep: number | null;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <ol className="flex items-center justify-center gap-2 pb-2">
      {steps.map((label, index) => (
        <li key={label} className="flex items-center gap-2" aria-current={index === currentStep ? 'step' : undefined}>
          <span
            aria-hidden="true"
            className={cx(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              index <= currentStep ? 'bg-accent text-on-accent' : 'bg-gray-700 text-fg-muted',
            )}
          >
            {index + 1}
          </span>
          <span className="sr-only">{label}</span>
          {index < steps.length - 1 && (
            <span aria-hidden="true" className={cx('w-12 h-0.5', index < currentStep ? 'bg-accent' : 'bg-gray-700')} />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Frame shared by the import wizards: modal, title and step indicator. */
export default function WizardModal({ title, steps, currentStep, onClose, footer, children }: WizardModalProps) {
  return (
    // A click outside would lose the file and every choice made so far
    <Modal open onClose={onClose} title={title} size="xl" footer={footer} closeOnBackdrop={false}>
      {currentStep !== null && <StepIndicator steps={steps} currentStep={currentStep} />}
      {children}
    </Modal>
  );
}
