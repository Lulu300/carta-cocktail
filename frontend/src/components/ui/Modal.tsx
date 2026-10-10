import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './classNames';
import IconButton from './IconButton';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

// The modal owns the dialog's open state and its click, pointer and Escape handling.
type OwnedDialogProps = 'open' | 'onClose' | 'onCancel' | 'onClick' | 'onPointerDown' | 'title' | 'children';

interface ModalProps extends Omit<ComponentPropsWithRef<'dialog'>, OwnedDialogProps> {
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

// Shared across modals so that stacked modals closing in any order
// only restore the page scroll once the last one is closed.
let scrollLockCount = 0;
let overflowBeforeLock = '';

function lockPageScroll() {
  if (scrollLockCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function unlockPageScroll() {
  scrollLockCount -= 1;
  if (scrollLockCount === 0) document.body.style.overflow = overflowBeforeLock;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * True when the pointer is on the backdrop: the dialog is the target (it has no
 * padding) and the point lies outside its box, which excludes its own scrollbar.
 */
function isOnBackdrop(dialog: HTMLDialogElement | null, event: MouseEvent<HTMLDialogElement>) {
  if (!dialog || event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right
    || event.clientY < box.top || event.clientY > box.bottom;
}

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
  ref,
  ...rest
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  // The body is mounted only once showModal() has run: React applies `autoFocus`
  // while committing, which has no effect inside a closed (display: none) dialog.
  // The header is there from the start, so showModal() focuses the close button
  // when the body asks for no autoFocus.
  const [isShown, setIsShown] = useState(false);

  const setDialogRef = useCallback((node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    assignRef(ref, node);
  }, [ref]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    setIsShown(dialog.open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockPageScroll();
    return unlockPageScroll;
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

  // A drag that starts in the content and ends on the backdrop fires a click on
  // the dialog too: only close when the press also started on the backdrop.
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pressStartedOnBackdrop.current = isOnBackdrop(dialogRef.current, event);
  };

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    const startedOnBackdrop = pressStartedOnBackdrop.current;
    pressStartedOnBackdrop.current = false;
    if (closeOnBackdrop && startedOnBackdrop && isOnBackdrop(dialogRef.current, event)) onClose();
  };

  return (
    <dialog
      {...rest}
      ref={setDialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cx(
        'm-auto w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-0',
        'bg-surface text-fg border border-line rounded-xl backdrop:bg-black/60',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <IconButton icon="close" label={t('common.close')} variant="neutral" onClick={onClose} className="-mr-2 -mt-2" />
          </div>
          {isShown && (
            <>
              <div className={cx('px-6 pt-4', !footer && 'pb-6')}>{children}</div>
              {footer && <div className="flex justify-end gap-3 px-6 pt-4 pb-6">{footer}</div>}
            </>
          )}
        </>
      )}
    </dialog>
  );
}
