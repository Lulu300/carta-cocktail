import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog open title="Delete the category?" onConfirm={onConfirm} onCancel={onCancel} {...props} />,
  );
  return { onConfirm, onCancel, ...utils };
}

describe('ConfirmDialog', () => {
  it('is an alert dialog named by its title and described by its message', () => {
    renderDialog({ message: 'This action cannot be undone.' });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the category?' });
    expect(dialog).toHaveAccessibleDescription('This action cannot be undone.');
  });

  it('uses the generic labels by default and focuses "Confirm" for a default tone', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'common.confirm' });
    expect(confirmButton).toHaveFocus();
    expect(confirmButton.className).toContain('bg-accent');
  });

  it('focuses "Cancel" and styles the confirm button as danger for a danger tone', () => {
    renderDialog({ tone: 'danger', confirmLabel: 'Delete', cancelLabel: 'Keep' });
    expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-danger');
  });

  it('calls onConfirm and onCancel from their buttons', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'common.confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel from the close button of the modal', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the details under the message', () => {
    renderDialog({
      message: 'Used by:',
      details: <ul><li>Negroni</li><li>Americano</li></ul>,
    });
    const message = screen.getByText('Used by:');
    const details = screen.getByRole('list');
    expect(message.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps "Confirm" disabled until the acknowledgment box is ticked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ acknowledgeLabel: 'I understand the risks' });
    const confirmButton = screen.getByRole('button', { name: 'common.confirm' });

    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'I understand the risks' }));
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('unticks the acknowledgment box when the parent closes and reopens it', async () => {
    const user = userEvent.setup();
    const props = {
      title: 'Delete the category?',
      acknowledgeLabel: 'I understand the risks',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    };
    const { rerender } = render(<ConfirmDialog open {...props} />);

    await user.click(screen.getByRole('checkbox', { name: 'I understand the risks' }));
    expect(screen.getByRole('button', { name: 'common.confirm' })).toBeEnabled();

    // Closed by the parent, without going through Cancel or Confirm.
    rerender(<ConfirmDialog open={false} {...props} />);
    rerender(<ConfirmDialog open {...props} />);

    expect(screen.getByRole('checkbox', { name: 'I understand the risks' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'common.confirm' })).toBeDisabled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
