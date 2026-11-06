import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

/**
 * Open state of a panel shown by a button (dropdown, mobile sidebar): a click
 * outside the container closes it, Escape closes it and gives the focus back to
 * the button. Spread `triggerProps` on the button, put `containerRef` and
 * `handleKeyDown` on the element that holds both the button and the panel, and
 * `panelId` on the panel. After an action chosen in the panel, call
 * `closeAndFocusTrigger`, so the focus does not fall back to the page.
 * Destructure the result: the React Compiler lint takes any property read on an
 * object that holds a ref for a ref read during render.
 */
export function useDisclosure<C extends HTMLElement = HTMLDivElement>(onClose?: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);
  const containerRef = useClickOutside<C>(close, isOpen);

  const closeAndFocusTrigger = () => {
    close();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    // Only the panel closes: an enclosing modal stays open.
    event.preventDefault();
    event.stopPropagation();
    closeAndFocusTrigger();
  };

  return {
    isOpen,
    close,
    closeAndFocusTrigger,
    panelId,
    containerRef,
    handleKeyDown,
    triggerProps: {
      ref: triggerRef,
      type: 'button',
      'aria-expanded': isOpen,
      'aria-controls': panelId,
      onClick: () => (isOpen ? close() : setIsOpen(true)),
    } as const,
  };
}
