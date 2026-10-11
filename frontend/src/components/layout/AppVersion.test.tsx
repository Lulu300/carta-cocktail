import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppVersion from './AppVersion';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AppVersion', () => {
  it('shows the release version with a leading v', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.8.0');

    render(<AppVersion />);

    expect(screen.getByText('v1.8.0')).toBeInTheDocument();
  });

  it('shows a pre-release version as is', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.9.0-rc.1');

    render(<AppVersion />);

    expect(screen.getByText('v1.9.0-rc.1')).toBeInTheDocument();
  });

  it('shows dev when no version is set', () => {
    vi.stubEnv('VITE_APP_VERSION', undefined);

    render(<AppVersion />);

    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows dev for the Dockerfile default, never "vdev"', () => {
    vi.stubEnv('VITE_APP_VERSION', 'dev');

    render(<AppVersion />);

    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.queryByText('vdev')).not.toBeInTheDocument();
  });

  it('shows dev for a blank version and trims spaces around a real one', () => {
    vi.stubEnv('VITE_APP_VERSION', '   ');
    const { unmount } = render(<AppVersion />);
    expect(screen.getByText('dev')).toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_APP_VERSION', ' 2.0.0 ');
    render(<AppVersion />);
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('keeps its base style and adds the classes of the caller', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.8.0');

    render(<AppVersion className="mt-auto" />);

    expect(screen.getByText('v1.8.0')).toHaveClass('text-xs', 'mt-auto');
  });
});
