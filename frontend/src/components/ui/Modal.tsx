import { useEffect, useId, useRef, type ComponentPropsWithRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './classNames';
import IconButton from './IconButton';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps extends Omit<ComponentPropsWithRef<'dialog'>, 'open' | 'onClose' | 'title' | 'children'> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Modal built on the native <dialog>: the browser provides the focus trap,
 * focus restoration, top-layer rendering and the Escape key.
 * The `open` prop stays the single source of truth; the dialog never closes itself.
 */
export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  footer,
  closeOnBackdrop = true,
  className,
  children,
  ...rest
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape: keep the dialog open and let the parent decide through onClose.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  // The browser may still close the dialog by itself (e.g. Chrome ignores a
  // repeated preventDefault on cancel): report it so the parent state follows.
  const handleNativeClose = () => {
    if (open) onClose();
  };

  // The dialog has no padding, so a click whose target is the dialog itself
  // landed on the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onClick={handleClick}
      className={cx(
        'm-auto w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-0',
        'bg-surface text-fg border border-line rounded-xl backdrop:bg-black/60',
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <IconButton icon="close" label={t('common.close')} variant="neutral" onClick={onClose} className="-mr-2 -mt-2" />
          </div>
          <div className={cx('px-6 pt-4', !footer && 'pb-6')}>{children}</div>
          {footer && <div className="flex justify-end gap-3 px-6 pt-4 pb-6">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
