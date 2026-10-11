import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import Modal from './Modal';

export type ConfirmTone = 'danger' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  /** Shown under the message, e.g. the list of items a deletion would affect. */
  details?: ReactNode;
  /** When set, a checkbox with this label must be ticked before confirming. */
  acknowledgeLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  /** Called on "Cancel", Escape, the close button and a click on the backdrop. */
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  details,
  acknowledgeLabel,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const messageId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const isDanger = tone === 'danger';

  // The box belongs to one question: untick it whenever the dialog opens or
  // closes, whoever closed it. A parent that asks a new question without
  // closing the dialog gives it a new `key` instead.
  if (open !== wasOpen) {
    setWasOpen(open);
    setAcknowledged(false);
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      aria-describedby={message ? messageId : undefined}
      footer={(
        <>
          {/* A destructive action must not be one Enter key away. */}
          <Button variant="ghost" onClick={onCancel} autoFocus={isDanger}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={Boolean(acknowledgeLabel) && !acknowledged}
            autoFocus={!isDanger}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      )}
    >
      {message && <p id={messageId} className="text-sm text-fg-muted">{message}</p>}
      {details && <div className="mt-3 text-sm">{details}</div>}
      {acknowledgeLabel && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="size-4 accent-accent"
          />
          {acknowledgeLabel}
        </label>
      )}
    </Modal>
  );
}
