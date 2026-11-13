import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import BackHomeLink from './BackHomeLink';

function RouteErrorScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <EmptyState
        icon="⚠️"
        title={t('errors.pageLoadFailed')}
        role="alert"
        action={(
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
            <BackHomeLink />
          </div>
        )}
      />
    </div>
  );
}

interface ErrorBoundaryProps {
  /** A new value clears the error, so the next page renders. */
  resetKey: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// React only catches render errors in a class component: there is no hook for it.
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    // Only an error shown before this update is cleared: when the navigation itself
    // fails, resetting now would render the failing page a second time.
    if (prevState.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? <RouteErrorScreen /> : this.props.children;
  }
}

/**
 * Replaces a page that failed to render, or whose chunk is still missing after the
 * automatic reload of utils/chunkReload.ts, with a way out instead of a blank screen.
 * Navigating to another page clears the error without reloading.
 */
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
