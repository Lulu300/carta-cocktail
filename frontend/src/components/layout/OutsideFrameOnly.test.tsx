import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { simulateFrame } from '../../test/frame';
import OutsideFrameOnly from './OutsideFrameOnly';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

function renderGuardedPage() {
  return render(
    <OutsideFrameOnly>
      <h1>Admin page</h1>
    </OutsideFrameOnly>,
  );
}

describe('OutsideFrameOnly', () => {
  it('shows the page in a top-level window', () => {
    renderGuardedPage();
    expect(screen.getByRole('heading', { name: 'Admin page' })).toBeInTheDocument();
  });

  it('replaces the page in an iframe by a link that opens it in the whole tab', async () => {
    window.history.pushState({}, '', '/admin/settings?tab=embed');
    simulateFrame();

    const { container } = renderGuardedPage();

    expect(screen.queryByRole('heading', { name: 'Admin page' })).not.toBeInTheDocument();
    expect(
      screen.getByText('The administration does not open inside another website'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open in the whole window' });
    expect(link).toHaveAttribute('href', '/admin/settings?tab=embed');
    expect(link).toHaveAttribute('target', '_top');
    expect(await axe(container)).toHaveNoViolations();
  });
});
