import type { ReactNode } from 'react';
import Button from './Button';
import { toast } from './ToastStore';

interface CopyButtonProps {
  /** What the button puts in the clipboard. */
  text: string;
  /** Toast shown once the text is copied. */
  copiedMessage: string;
  /** Toast shown when the browser refuses (permission). */
  failedMessage: string;
  children: ReactNode;
}

/**
 * Copies a text shown in a read-only field, and says so in a toast. Renders nothing outside
 * a secure context (a plain http LAN address), where the browser has no clipboard API: the
 * field next to it keeps the text selectable.
 */
export default function CopyButton({
  text,
  copiedMessage,
  failedMessage,
  children,
}: CopyButtonProps) {
  if (!navigator.clipboard) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copiedMessage);
    } catch {
      toast.error(new Error(failedMessage));
    }
  };

  return (
    <Button variant="secondary" onClick={handleCopy}>
      {children}
    </Button>
  );
}
