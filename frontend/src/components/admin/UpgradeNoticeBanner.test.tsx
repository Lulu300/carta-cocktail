import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { server } from '../../test/msw/server';
import { captureRequest, mockApiError, mockApiResponse } from '../../test/msw/utils';
import type { UpgradeNotice } from '../../types';
import Toaster from '../ui/Toaster';
import UpgradeNoticeBanner, { UPGRADING_GUIDE_URL } from './UpgradeNoticeBanner';

const upgradeFrom150To170: UpgradeNotice = {
  from: '1.5.0',
  to: '1.7.0',
  actions: [
    { version: '1.6.0', when: 'before', action: 'Back up the database.' },
    { version: '1.6.0', when: 'after', action: 'Check the backend log.' },
    { version: '1.6.0', when: 'after', action: 'Check a photo is served.' },
    { version: '1.7.0', when: 'before', action: 'Check the host is 64-bit.' },
    { version: '1.7.0', when: 'after', action: 'Check the menus.' },
  ],
};

/** The backend: the notice until it is acknowledged, then 204. */
function mockPendingNotice(notice: UpgradeNotice) {
  let acknowledged = false;
  server.use(
    http.get('/api/system/upgrade-notice', () =>
      acknowledged ? new HttpResponse(null, { status: 204 }) : HttpResponse.json(notice),
    ),
    http.post('/api/system/upgrade-notice/acknowledge', () => {
      acknowledged = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

/** Version headings and their actions, in the order shown. */
function versionsAndActions(element: HTMLElement): string[] {
  return within(element)
    .getAllByRole('heading', { level: 4 })
    .map((heading) => {
      const actions = within(heading.nextElementSibling as HTMLElement).getAllByRole('listitem');
      return `${heading.textContent}: ${actions.map((item) => item.textContent).join(' | ')}`;
    });
}

describe('UpgradeNoticeBanner', () => {
  it('lists the actions to do before and after the upgrade apart, grouped by version from the oldest', async () => {
    mockPendingNotice(upgradeFrom150To170);
    const { container } = render(<UpgradeNoticeBanner />);

    expect(
      await screen.findByRole('heading', { name: /^Upgrade from v.+ to v.+$/ }),
    ).toBeInTheDocument();
    expect(versionsAndActions(section('To do before the upgrade: check them now'))).toEqual([
      'v1.6.0: Back up the database.',
      'v1.7.0: Check the host is 64-bit.',
    ]);
    expect(versionsAndActions(section('To do after the upgrade'))).toEqual([
      'v1.6.0: Check the backend log. | Check a photo is served.',
      'v1.7.0: Check the menus.',
    ]);
    expect(screen.getByRole('link', { name: 'Upgrade guide (UPGRADING.md)' })).toHaveAttribute(
      'href',
      UPGRADING_GUIDE_URL,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows no section for a timing without actions', async () => {
    mockApiResponse('get', '/api/system/upgrade-notice', {
      ...upgradeFrom150To170,
      actions: [{ version: '1.6.0', when: 'after', action: 'Check the backend log.' }],
    });
    render(<UpgradeNoticeBanner />);

    expect(
      await screen.findByRole('region', { name: 'To do after the upgrade' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'To do before the upgrade: check them now' }),
    ).not.toBeInTheDocument();
  });

  it('confirms the actions and hides the banner', async () => {
    const user = userEvent.setup();
    mockPendingNotice(upgradeFrom150To170);
    const acknowledgements = captureRequest('post', '/api/system/upgrade-notice/acknowledge');
    render(<UpgradeNoticeBanner />);

    await user.click(await screen.findByRole('button', { name: 'I have done these actions' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /^Upgrade from v.+ to v.+$/ }),
      ).not.toBeInTheDocument(),
    );
    expect(acknowledgements.count()).toBe(1);
  });

  it('keeps the banner and reports the error when the confirmation fails', async () => {
    const user = userEvent.setup();
    mockPendingNotice(upgradeFrom150To170);
    mockApiError('post', '/api/system/upgrade-notice/acknowledge', 500, 'Internal server error');
    render(
      <>
        <UpgradeNoticeBanner />
        <Toaster />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: 'I have done these actions' }));

    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Upgrade from v.+ to v.+$/ })).toBeInTheDocument();
  });

  it('shows nothing when the backend has no notice (204)', async () => {
    const notices = captureRequest('get', '/api/system/upgrade-notice');
    const { container } = render(<UpgradeNoticeBanner />);

    await waitFor(() => expect(notices.count()).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });
});
