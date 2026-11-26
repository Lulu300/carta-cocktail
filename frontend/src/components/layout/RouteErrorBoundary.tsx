import { Component, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { cx } from '../ui/classNames';
import BackHomeLink from './BackHomeLink';

interface RouteErrorDisplay {
  /** Fills the whole window, for an error outside any layout. */
  fullScreen: boolean;
  backLink: ReactNode;
}

function RouteErrorScreen({ fullScreen, backLink }: RouteErrorDisplay) {
  const { t } = useTranslation();
  const titleRef = useRef<HTMLParagraphElement>(null);

  // The link that was clicked is gone with the failed page: restart the keyboard from here.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className={cx('flex items-center justify-center', fullScreen && 'min-h-screen bg-canvas')}>
      <EmptyState
        icon="⚠️"
        title={t('errors.pageLoadFailed')}
        titleProps={{ role: 'alert', tabIndex: -1, ref: titleRef, className: 'outline-none' }}
        action={(
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
            {backLink}
          </div>
        )}
      />
    </div>
  );
}

interface ErrorBoundaryProps extends RouteErrorDisplay {
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
    const { fullScreen, backLink, children } = this.props;
    return this.state.hasError ? <RouteErrorScreen fullScreen={fullScreen} backLink={backLink} /> : children;
  }
}

interface RouteErrorBoundaryProps extends Partial<RouteErrorDisplay> {
  children: ReactNode;
}

/**
 * Replaces a page that failed to render, or whose chunk is still missing after the
 * automatic reload of utils/chunkReload.ts, with a way out instead of a blank screen.
 * Any navigation clears the error without reloading, a link to the current page too
 * (it gets a new location key).
 */
export default function RouteErrorBoundary({
  fullScreen = true,
  backLink = <BackHomeLink />,
  children,
}: RouteErrorBoundaryProps) {
  const { key } = useLocation();
  return <ErrorBoundary resetKey={key} fullScreen={fullScreen} backLink={backLink}>{children}</ErrorBoundary>;
}
