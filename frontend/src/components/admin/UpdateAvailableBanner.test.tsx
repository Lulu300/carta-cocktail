import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { render, screen } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { announceUpdate } from '../../pwa/updateAvailable';
import UpdateAvailableBanner from './UpdateAvailableBanner';

afterEach(() => {
  vi.unstubAllGlobals();
});

// The store is a module of its own: once announced, the update stays for the rest of this file.
describe('UpdateAvailableBanner', () => {
  it('shows nothing while no new version has taken over', () => {
    const { container } = render(<UpdateAvailableBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('appears when a new version takes over, and reloads on request', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const { container } = render(<UpdateAvailableBanner />);

    act(() => announceUpdate());

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available');
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('is translated', async () => {
    await i18n.changeLanguage('fr');
    render(<UpdateAvailableBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Une nouvelle version est disponible');
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
  });
});
