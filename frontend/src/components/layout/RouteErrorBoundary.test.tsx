import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import RouteErrorBoundary from './RouteErrorBoundary';
import { axe } from '../../test/axe';

const brokenPageRender = vi.fn();
// While true, the page at / throws too, like a home page whose failure was temporary.
let homeIsBroken = false;

// Stands for the routed pages: the one at /broken throws while rendering.
function Page() {
  const { pathname } = useLocation();
  if (pathname === '/broken' || (pathname === '/' && homeIsBroken)) {
    brokenPageRender();
    throw new Error('render failed');
  }
  return (
    <>
      <p>{pathname}</p>
      <Link to="/broken">go</Link>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteErrorBoundary>
        <Page />
      </RouteErrorBoundary>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  homeIsBroken = false;
  brokenPageRender.mockClear();
  // React reports every error a boundary catches on the console
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RouteErrorBoundary', () => {
  it('renders the page when nothing fails', () => {
    renderAt('/');

    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a page that throws with the translated error screen', async () => {
    const { container } = renderAt('/broken');

    expect(screen.getByRole('alert')).toHaveTextContent('errors.pageLoadFailed');
    expect(screen.getByRole('button', { name: 'errors.reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'public.backHome' })).toHaveAttribute('href', '/');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('announces the title alone and moves the focus to it', () => {
    renderAt('/broken');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/^errors\.pageLoadFailed$/);
    expect(alert).toHaveFocus();
  });

  it('takes the whole window by default, and only its place when told so', () => {
    const { container, unmount } = renderAt('/broken');
    expect(container.firstElementChild).toHaveClass('min-h-screen');
    unmount();

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <RouteErrorBoundary fullScreen={false} backLink={<Link to="/start">start</Link>}>
          <Page />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert').closest('.min-h-screen')).toBeNull();
    expect(screen.getByRole('link', { name: 'start' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'public.backHome' })).not.toBeInTheDocument();
  });

  it('clears the error with a link to the page that failed, once the cause is gone', async () => {
    homeIsBroken = true;
    renderAt('/');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    homeIsBroken = false;
    await userEvent.click(screen.getByRole('link', { name: 'public.backHome' }));

    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads the page from the reload button', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderAt('/broken');

    await userEvent.click(screen.getByRole('button', { name: 'errors.reload' }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('clears the error when the visitor goes back home', async () => {
    renderAt('/broken');

    await userEvent.click(screen.getByRole('link', { name: 'public.backHome' }));

    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render the failing page again when the navigation itself fails', async () => {
    // Baseline: how many times React renders a page that fails on the first render
    const firstRender = renderAt('/broken');
    const rendersOfAFailingPage = brokenPageRender.mock.calls.length;
    firstRender.unmount();
    brokenPageRender.mockClear();

    renderAt('/');
    await userEvent.click(screen.getByRole('link', { name: 'go' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // The path changed in the same update that failed: clearing the error for it
    // would render the failing page once more before showing the screen again.
    expect(brokenPageRender).toHaveBeenCalledTimes(rendersOfAFailingPage);
  });
});
