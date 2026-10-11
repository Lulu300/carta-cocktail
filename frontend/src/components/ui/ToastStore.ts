import i18n from '../../i18n';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Time in milliseconds before the toast closes by itself. */
  duration?: number;
  action?: ToastAction;
}

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

// Errors stay twice as long: they usually need to be read, not just noticed.
const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
};

interface DismissTimer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

type Listener = () => void;

// Module-level store, so that code outside React (the query client) can show toasts.
let toasts: readonly Toast[] = [];
let nextId = 0;
const listeners = new Set<Listener>();
const timers = new Map<string, DismissTimer>();

function setToasts(next: readonly Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

function startTimer(id: string, duration: number) {
  timers.set(id, {
    handle: setTimeout(() => dismiss(id), duration),
    remaining: duration,
    startedAt: Date.now(),
  });
}

function dismiss(id: string) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
  if (toasts.some((item) => item.id === id)) {
    setToasts(toasts.filter((item) => item.id !== id));
  }
}

function show(tone: ToastTone, message: string, options: ToastOptions = {}): string {
  nextId += 1;
  const id = `toast-${nextId}`;
  setToasts([...toasts, { id, tone, message, action: options.action }]);
  startTimer(id, options.duration ?? DEFAULT_DURATIONS[tone]);
  return id;
}

/**
 * The message of a caught value: an Error (ApiError included) carries a text the
 * backend has already translated; anything else gets the generic error message.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return i18n.t('common.error');
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show('success', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  /** Takes the caught value. A plain string is not shown: wrap a custom message in an Error. */
  error: (error: unknown, options?: ToastOptions) => show('error', errorMessage(error), options),
  dismiss,
};

/** Stops the countdown of a toast, e.g. while the pointer or the focus is on it. */
function pause(id: string) {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  timer.handle = null;
  timer.remaining -= Date.now() - timer.startedAt;
}

/** Restarts the countdown of a paused toast with the time it had left. */
function resume(id: string) {
  const timer = timers.get(id);
  if (!timer || timer.handle) return;
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => dismiss(id), Math.max(timer.remaining, 0));
}

/** Subscription API for useSyncExternalStore, plus the countdown controls of the Toaster. */
export const toastStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => toasts,
  pause,
  resume,
};
