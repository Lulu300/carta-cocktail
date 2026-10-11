/* eslint-disable react-refresh/only-export-components */
import type { ReactElement } from 'react';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import Toaster from '../components/ui/Toaster';
import { toast, toastStore } from '../components/ui/ToastStore';
import { act, render } from './test-utils';

// Kept apart from test-utils: the toast store loads the real i18n setup, which
// tests that mock react-i18next without initReactI18next cannot import.

/**
 * Renders a page with the confirmation dialog and the toasts it relies on, as
 * mounted by main.tsx. Pair it with `afterEach(clearToasts)`: toasts live in a
 * module-level store that outlives the test.
 */
export function renderWithFeedback(ui: ReactElement, options?: Parameters<typeof render>[1]) {
  return render(
    <ConfirmProvider>
      {ui}
      <Toaster />
    </ConfirmProvider>,
    options,
  );
}

export function clearToasts() {
  act(() => {
    toastStore.getSnapshot().forEach((item) => toast.dismiss(item.id));
  });
}
