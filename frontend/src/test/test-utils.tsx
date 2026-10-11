/* eslint-disable react-refresh/only-export-components */
import { render, renderHook, type RenderHookOptions, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { act } from '@testing-library/react';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import Toaster from '../components/ui/Toaster';
import { toast, toastStore } from '../components/ui/ToastStore';

/**
 * Query client for tests: no retry, so an error shows at once, and no garbage
 * collection timer left running after the test ends.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

interface QueryClientOption {
  /** Pass a client to inspect its cache; each render gets a fresh one otherwise. */
  queryClient?: QueryClient;
}

function createProviders(queryClient: QueryClient) {
  return function AllProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  };
}

function customRender(ui: ReactElement, options: Omit<RenderOptions, 'wrapper'> & QueryClientOption = {}) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;
  return render(ui, { wrapper: createProviders(queryClient), ...renderOptions });
}

function customRenderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> & QueryClientOption = {},
) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;
  return renderHook(hook, { wrapper: createProviders(queryClient), ...renderOptions });
}

/**
 * Renders a page with the confirmation dialog and the toasts it relies on, as
 * mounted by main.tsx. Pair it with `afterEach(clearToasts)`: toasts live in a
 * module-level store that outlives the test.
 */
function renderWithFeedback(ui: ReactElement, options: Omit<RenderOptions, 'wrapper'> & QueryClientOption = {}) {
  return customRender(
    <ConfirmProvider>
      {ui}
      <Toaster />
    </ConfirmProvider>,
    options,
  );
}

function clearToasts() {
  act(() => {
    toastStore.getSnapshot().forEach((item) => toast.dismiss(item.id));
  });
}

export * from '@testing-library/react';
export { customRender as render, customRenderHook as renderHook, renderWithFeedback, clearToasts };
