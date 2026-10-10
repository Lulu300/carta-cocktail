import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

// jsdom has no layout: give the dialog a box so backdrop detection can work.
const DIALOG_BOX = { left: 100, top: 100, right: 500, bottom: 400 };
const OUTSIDE = { clientX: 5, clientY: 5 };
const INSIDE = { clientX: 300, clientY: 200 };

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal open onClose={onClose} title="Edit category" {...props}>
      <p>Modal body</p>
    </Modal>,
  );
  return { onClose, ...utils };
}

function getDialogElement(container: HTMLElement): HTMLDialogElement {
  const dialog = container.querySelector('dialog');
  if (!dialog) throw new Error('dialog not rendered');
  return dialog;
}

function pressAndRelease(pressTarget: Element, releaseTarget: Element, point: { clientX: number; clientY: number }) {
  fireEvent.pointerDown(pressTarget, point);
  fireEvent.click(releaseTarget, point);
}

describe('Modal', () => {
  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, 'getBoundingClientRect').mockReturnValue(DIALOG_BOX as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });

  it('uses the title as the accessible name of the dialog', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Edit category' })).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('renders nothing visible when closed', () => {
    const { container } = renderModal({ open: false });
    expect(getDialogElement(container).open).toBe(false);
    expect(screen.queryByText('Modal body')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose on Escape (cancel event) and keeps the dialog open', () => {
    const { onClose, container } = renderModal();
    const dialog = getDialogElement(container);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('calls onClose when a press starts and ends on the backdrop', () => {
    const { onClose, container } = renderModal();
    const dialog = getDialogElement(container);
    pressAndRelease(dialog, dialog, OUTSIDE);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a click in the content', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByText('Modal body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close when a drag starts in the content and ends on the backdrop', () => {
    const { onClose, container } = renderModal();
    pressAndRelease(screen.getByText('Modal body'), getDialogElement(container), OUTSIDE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on a click on the dialog box itself, such as its scrollbar', () => {
    const { onClose, container } = renderModal();
    const dialog = getDialogElement(container);
    pressAndRelease(dialog, dialog, INSIDE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores backdrop clicks when closeOnBackdrop is false', () => {
    const { onClose, container } = renderModal({ closeOnBackdrop: false });
    const dialog = getDialogElement(container);
    pressAndRelease(dialog, dialog, OUTSIDE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the footer when provided', () => {
    renderModal({ footer: <button type="button">Save</button> });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies the size class', () => {
    const { container } = renderModal({ size: 'xl' });
    expect(getDialogElement(container).className).toContain('max-w-2xl');
  });

  it('reports a dialog closed by the browser while still open', () => {
    const { onClose, container } = renderModal();
    getDialogElement(container).close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens with a consumer ref and forwards the dialog element to it', () => {
    const ref = createRef<HTMLDialogElement>();
    const { container } = renderModal({ ref });
    const dialog = getDialogElement(container);
    expect(dialog.open).toBe(true);
    expect(ref.current).toBe(dialog);
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('forwards the dialog element to a callback ref', () => {
    const ref = vi.fn();
    const { container } = renderModal({ ref });
    expect(ref).toHaveBeenCalledWith(getDialogElement(container));
  });

  it('mounts the content only once the dialog is open, so autoFocus works', () => {
    let dialogOpenWhenMounted: boolean | undefined;
    render(
      <Modal open onClose={vi.fn()} title="Rename">
        <input
          aria-label="Name"
          autoFocus
          ref={(input) => {
            if (input) dialogOpenWhenMounted = input.closest('dialog')?.open;
          }}
        />
      </Modal>,
    );
    expect(dialogOpenWhenMounted).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('opens and closes the dialog and locks page scroll while open', () => {
    const closeSpy = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      const close = () => {
        closeSpy();
        setOpen(false);
      };
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={close} title="Harness">
            <p>Harness body</p>
          </Modal>
        </>
      );
    }
    const { container } = render(<Harness />);
    const dialog = getDialogElement(container);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(dialog.open).toBe(false);
    // The close event fired by dialog.close() must not report the closing twice.
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByText('Harness body')).not.toBeInTheDocument();
  });

  it('keeps the page locked until the last of two stacked modals closes', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(
      <>
        <Modal open onClose={vi.fn()} title="First"><p>First</p></Modal>
        <Modal open onClose={vi.fn()} title="Second"><p>Second</p></Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    // Close the first opened modal first: the second one still needs the lock.
    rerender(
      <>
        <Modal open={false} onClose={vi.fn()} title="First"><p>First</p></Modal>
        <Modal open onClose={vi.fn()} title="Second"><p>Second</p></Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <Modal open={false} onClose={vi.fn()} title="First"><p>First</p></Modal>
        <Modal open={false} onClose={vi.fn()} title="Second"><p>Second</p></Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('scroll');
  });
});
