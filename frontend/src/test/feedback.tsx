import type { ReactElement } from 'react';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import Toaster from '../components/ui/Toaster';
import { toast, toastStore } from '../components/ui/ToastStore';
import { act, render } from './test-utils';

// Kept apart from test-utils, which every test imports: only the pages that show toasts or
// confirmations need the toast store and the confirmation provider.

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
