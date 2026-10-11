import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import ConfirmDialog, { type ConfirmTone } from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message?: string;
  details?: ReactNode;
  acknowledgeLabel?: string;
  confirmLabel?: string;
  tone?: ConfirmTone;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Question {
  /** Changes with every question, so the dialog state (the acknowledgment box) never carries over. */
  id: number;
  /** Null once the question is answered; the id stays so the dialog closes instead of remounting. */
  options: ConfirmOptions | null;
}

/** Mounts a single confirmation dialog, opened through useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<Question>({ id: 0, options: null });
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const lastIdRef = useRef(0);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setQuestion((current) => ({ id: current.id, options: null }));
  }, []);

  const confirm = useCallback<Confirm>((nextOptions) => {
    // A new question replaces a pending one, which counts as cancelled.
    resolveRef.current?.(false);
    lastIdRef.current += 1;
    setQuestion({ id: lastIdRef.current, options: nextOptions });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const { options } = question;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        key={question.id}
        open={options !== null}
        title={options?.title ?? ''}
        message={options?.message}
        details={options?.details}
        acknowledgeLabel={options?.acknowledgeLabel}
        confirmLabel={options?.confirmLabel}
        tone={options?.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/** Asks a question in a dialog; the promise resolves to true only on "Confirm". */
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside a ConfirmProvider');
  return confirm;
}
