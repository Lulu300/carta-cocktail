import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import i18n from '../../i18n';
import { ApiError } from '../../services/api';
import { toast, toastStore } from './ToastStore';

function messages() {
  return toastStore.getSnapshot().map((item) => item.message);
}

describe('ToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    toastStore.getSnapshot().forEach((item) => toast.dismiss(item.id));
    vi.useRealTimers();
  });

  it('adds toasts with their tone and returns their id', () => {
    const successId = toast.success('Saved');
    const infoId = toast.info('Heads up');

    expect(successId).not.toBe(infoId);
    expect(toastStore.getSnapshot()).toEqual([
      { id: successId, tone: 'success', message: 'Saved', action: undefined },
      { id: infoId, tone: 'info', message: 'Heads up', action: undefined },
    ]);
  });

  it('notifies subscribers on every change until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);

    const id = toast.success('Saved');
    toast.dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    toast.success('Again');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('removes success and info toasts after 4 s', () => {
    toast.success('Saved');
    toast.info('Heads up');

    vi.advanceTimersByTime(3999);
    expect(messages()).toEqual(['Saved', 'Heads up']);

    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it('keeps error toasts for 8 s', () => {
    toast.error(new Error('Failed'));

    vi.advanceTimersByTime(7999);
    expect(messages()).toEqual(['Failed']);

    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it('uses the duration option when given', () => {
    toast.success('Quick', { duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(messages()).toEqual([]);
  });

  it('dismisses a toast on demand and ignores an unknown id', () => {
    const listener = vi.fn();
    const id = toast.success('Saved');
    toastStore.subscribe(listener);

    toast.dismiss(id);
    toast.dismiss(id);

    expect(messages()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shows the message of an ApiError, already translated by the backend', () => {
    toast.error(new ApiError(409, 'Catégorie utilisée par 2 bouteilles'));
    expect(toastStore.getSnapshot()[0]).toMatchObject({
      tone: 'error',
      message: 'Catégorie utilisée par 2 bouteilles',
    });
  });

  it('shows the generic error message for a value that is not an Error', () => {
    toast.error('boom');
    toast.error(new Error(''));
    expect(messages()).toEqual([i18n.t('common.error'), i18n.t('common.error')]);
  });

  it('keeps the action of a toast', () => {
    const onClick = vi.fn();
    toast.info('Deleted', { action: { label: 'Undo', onClick } });
    expect(toastStore.getSnapshot()[0].action).toEqual({ label: 'Undo', onClick });
  });

  it('pauses the countdown and resumes it with the time left', () => {
    const id = toast.success('Saved');

    vi.advanceTimersByTime(3000);
    toastStore.pause(id);
    toastStore.pause(id);
    vi.advanceTimersByTime(10000);
    expect(messages()).toEqual(['Saved']);

    toastStore.resume(id);
    toastStore.resume(id);
    vi.advanceTimersByTime(999);
    expect(messages()).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it('ignores pause and resume for a toast that is gone', () => {
    const id = toast.success('Saved');
    toast.dismiss(id);

    toastStore.pause(id);
    toastStore.resume(id);
    vi.advanceTimersByTime(5000);
    expect(messages()).toEqual([]);
  });
});
