import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '../../test/test-utils';
import { AppProviders } from '../../test/appProviders';
import { buildSiteSettings } from '../../test/factories';
import { mockApiResponse } from '../../test/msw/utils';
import { axe } from '../../test/axe';
import NotFoundPage from './NotFoundPage';

beforeEach(() => {
  mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName: 'Chez Lulu' }));
});

describe('NotFoundPage', () => {
  it('tells the page does not exist, titles the tab and links to the home page', async () => {
    const { container } = render(<AppProviders><NotFoundPage /></AppProviders>);

    // The title comes after the site settings: waiting for it leaves no update pending
    await waitFor(() => expect(document.title).toBe('Page not found · Chez Lulu'));
    expect(screen.getByRole('alert')).toHaveTextContent('Page not found');
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(await axe(container)).toHaveNoViolations();
  });
});
