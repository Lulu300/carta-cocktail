import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import Toaster from './Toaster';
import { toast, toastStore } from './ToastStore';

afterEach(() => {
  act(() => {
    toastStore.getSnapshot().forEach((item) => toast.dismiss(item.id));
  });
  vi.useRealTimers();
});

describe('Toaster', () => {
  it('shows a toast called from outside any component', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Category created');
    });
    expect(within(screen.getByRole('status')).getByText('Category created')).toBeInTheDocument();
  });

  it('announces errors in the alert region and notices in the status region', () => {
    render(<Toaster />);
    act(() => {
      toast.error(new Error('Category still used'));
      toast.info('Heads up');
    });

    const alert = screen.getByRole('alert');
    const status = screen.getByRole('status');
    expect(within(alert).getByText('Category still used')).toBeInTheDocument();
    expect(within(alert).queryByText('Heads up')).not.toBeInTheDocument();
    expect(within(status).getByText('Heads up')).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('closes a toast with its close button, from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      toast.error(new Error('Failed'));
    });

    await user.tab();
    expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('runs the action callback and closes the toast', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.info('Bottle deleted', { action: { label: 'Undo', onClick } });
    });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Bottle deleted')).not.toBeInTheDocument();
  });

  it('keeps a toast while the pointer is on it', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast.success('Saved');
    });
    const item = screen.getByText('Saved').parentElement as HTMLElement;

    fireEvent.mouseEnter(item);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.mouseLeave(item);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps a toast while the focus is inside it, buttons included', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast.error(new Error('Failed'), { action: { label: 'Retry', onClick: vi.fn() } });
    });
    const action = screen.getByRole('button', { name: 'Retry' });
    const close = screen.getByRole('button', { name: 'common.close' });

    fireEvent.focus(action);
    fireEvent.blur(action, { relatedTarget: close });
    fireEvent.focus(close);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();

    fireEvent.blur(close, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });
});
