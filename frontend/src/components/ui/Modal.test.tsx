import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

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

describe('Modal', () => {
  afterEach(() => {
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

  it('calls onClose on a backdrop click but not on a content click', async () => {
    const user = userEvent.setup();
    const { onClose, container } = renderModal();
    await user.click(screen.getByText('Modal body'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(getDialogElement(container));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores backdrop clicks when closeOnBackdrop is false', async () => {
    const user = userEvent.setup();
    const { onClose, container } = renderModal({ closeOnBackdrop: false });
    await user.click(getDialogElement(container));
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

  it('opens and closes the dialog and locks page scroll while open', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Harness">
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
    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByText('Harness body')).not.toBeInTheDocument();
  });
});
