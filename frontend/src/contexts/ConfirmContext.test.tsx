import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, render, renderHook, screen, fireEvent } from '../test/test-utils';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm, type ConfirmOptions } from './ConfirmContext';

// jsdom has no layout: give the dialog a box so backdrop clicks can be detected.
const DIALOG_BOX = { left: 100, top: 100, right: 500, bottom: 400 };
const OUTSIDE = { clientX: 5, clientY: 5 };

function AskButton({ options }: { options: ConfirmOptions }) {
  const confirm = useConfirm();
  const [answers, setAnswers] = useState<boolean[]>([]);

  const ask = async () => {
    const answer = await confirm(options);
    setAnswers((previous) => [...previous, answer]);
  };

  return (
    <>
      <button type="button" onClick={ask}>Ask</button>
      <output>{answers.join(',')}</output>
    </>
  );
}

function renderAsk(options: ConfirmOptions = { title: 'Delete the bottle?' }) {
  return render(
    <ConfirmProvider>
      <AskButton options={options} />
    </ConfirmProvider>,
  );
}

function answers() {
  return screen.getByRole('status').textContent;
}

describe('ConfirmProvider and useConfirm', () => {
  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, 'getBoundingClientRect').mockReturnValue(DIALOG_BOX as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the dialog with the given options', async () => {
    const user = userEvent.setup();
    renderAsk({ title: 'Delete the bottle?', message: 'It is used by 2 menus.', confirmLabel: 'Delete', tone: 'danger' });

    await user.click(screen.getByText('Ask'));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete the bottle?' });
    expect(dialog).toHaveAccessibleDescription('It is used by 2 menus.');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toHaveFocus();
  });

  it('resolves to true on "Confirm" and closes the dialog', async () => {
    const user = userEvent.setup();
    renderAsk();

    await user.click(screen.getByText('Ask'));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    expect(answers()).toBe('true');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves to false on "Cancel"', async () => {
    const user = userEvent.setup();
    renderAsk();

    await user.click(screen.getByText('Ask'));
    await user.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(answers()).toBe('false');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves to false on Escape', async () => {
    const user = userEvent.setup();
    renderAsk();

    await user.click(screen.getByText('Ask'));
    fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));

    expect(await screen.findByText('false')).toBeInTheDocument();
  });

  it('resolves to false on a click on the backdrop', async () => {
    const user = userEvent.setup();
    renderAsk();

    await user.click(screen.getByText('Ask'));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.pointerDown(dialog, OUTSIDE);
    fireEvent.click(dialog, OUTSIDE);

    expect(await screen.findByText('false')).toBeInTheDocument();
  });

  it('works for several questions in a row', async () => {
    const user = userEvent.setup();
    renderAsk();

    await user.click(screen.getByText('Ask'));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));
    await user.click(screen.getByText('Ask'));
    await user.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(answers()).toBe('true,false');
  });

  it('cancels a pending question when a new one is asked', async () => {
    let confirm: ReturnType<typeof useConfirm> | undefined;
    function CaptureConfirm() {
      confirm = useConfirm();
      return null;
    }
    render(<ConfirmProvider><CaptureConfirm /></ConfirmProvider>);

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = confirm?.({ title: 'First' });
      second = confirm?.({ title: 'Second' });
    });

    await expect(first).resolves.toBe(false);
    expect(screen.getByRole('alertdialog', { name: 'Second' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }));
    await expect(second).resolves.toBe(true);
  });

  it('throws when used outside a ConfirmProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useConfirm())).toThrow('useConfirm must be used inside a ConfirmProvider');
  });
});
