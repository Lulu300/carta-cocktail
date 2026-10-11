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

/** Mounts a single confirmation dialog, opened through useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<Confirm>((nextOptions) => {
    // A new question replaces a pending one, which counts as cancelled.
    resolveRef.current?.(false);
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
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
