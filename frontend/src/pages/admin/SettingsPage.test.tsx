import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { act, fireEvent } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import { AppProviders } from '../../test/appProviders';
import { ConfirmProvider } from '../../contexts/ConfirmContext';
import { toast } from '../../components/ui/ToastStore';
import type { BackupRestoreResult } from '../../types';
import { mockDownload } from '../../test/download';
import { buildAdminSiteSettings, buildMenu, buildSiteSettings } from '../../test/factories';
import { ADMIN_USER } from '../../test/msw/handlers';
import {
  captureRequest,
  holdApiResponse,
  mockApiError,
  mockApiPending,
  mockApiResponse,
  mockNetworkError,
  mockProxyError,
  rejectNextFetch,
} from '../../test/msw/utils';

const admin = { ...ADMIN_USER, email: 'admin@test.local' };

// Set by services/api.ts when the backend does not answer
const SERVER_UNAVAILABLE = 'The server is not responding, try again in a moment.';

function restoreResult(overrides: Partial<BackupRestoreResult> = {}): BackupRestoreResult {
  return { message: 'Backup restored', skippedFiles: 0, restartRecommended: false, ...overrides };
}

function mockRestore(result: BackupRestoreResult) {
  mockApiResponse('post', '/api/backup/import', result);
}

/** The page inside the providers of main.tsx: the signed-in admin and the site settings. */
function renderPage() {
  return render(
    <AppProviders>
      <ConfirmProvider>
        <SettingsPage />
      </ConfirmProvider>
    </AppProviders>,
  );
}

/** Renders the page and waits for the site settings and the admin email. */
async function renderLoadedPage() {
  renderPage();
  expect(await screen.findByDisplayValue('My Bar')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('admin@test.local')).toBeInTheDocument();
}

function siteSaveButton() {
  return screen.getAllByText('Save')[0]!;
}

function embedSaveButton() {
  return screen.getAllByText('Save')[1]!;
}

function profileSaveButton() {
  return screen.getAllByText('Save')[2]!;
}

// MAX_BACKUP_UPLOAD_BYTES of backend/src/services/backupService.ts, the largest archive it accepts
const BACKEND_UPLOAD_LIMIT = 200 * 1024 * 1024;

/** Chooses an archive in the hidden file input, of `size` bytes when given. */
function chooseBackupFile(size?: number): File {
  const fileInput = document.querySelector('input[type="file"]');
  if (!(fileInput instanceof HTMLInputElement)) throw new Error('No file input');
  const file = new File(['content'], 'backup.zip', { type: 'application/zip' });
  // A real archive of 200 MB would weigh on the test's memory: only its size is read
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(fileInput, { target: { files: [file] } });
  return file;
}

async function selectBackupFile(size?: number): Promise<File> {
  await waitFor(() => {
    expect(screen.getByText('Select ZIP file')).toBeInTheDocument();
  });

  const file = chooseBackupFile(size);

  // Import button appears after file selection
  await waitFor(() => {
    expect(screen.getByText('Restore Backup')).toBeInTheDocument();
  });
  return file;
}

async function selectBackupFileAndClickImport(size?: number): Promise<File> {
  const file = await selectBackupFile(size);
  fireEvent.click(screen.getByText('Restore Backup'));
  return file;
}

async function answerRestoreDialog(buttonName: 'Restore Backup' | 'Cancel') {
  const dialog = await screen.findByRole('alertdialog', { name: 'Restore Backup' });
  expect(dialog).toHaveAccessibleDescription(
    'This will replace ALL current data (database, images and admin account). This action cannot be undone. You will then have to sign in again with the email and password that were in use when the backup was made. Continue?',
  );
  // userEvent waits for the restore that the answer starts: its updates stay inside act()
  await userEvent.click(within(dialog).getByRole('button', { name: buttonName }));
}

// A restore that ends without its result shows its cause, then the advice shared by both causes
const RESTORE_TIMEOUT =
  'The server did not answer in time, but the restore may still be running. Do not start the restore again: wait a few minutes, then reload the page. Once the restore has finished, you are signed out. If the page then shows a server error, the backup probably comes from an older version: restart the backend, as explained in "Restoring a backup from an older version" in UPGRADING.md. If nothing has changed after several minutes, check the backend logs before trying again.';
const RESTORE_NO_ANSWER =
  'The connection to the server was cut before it answered (the browser or a proxy stopped waiting, or the network was lost), but the restore may still be running. Check your network connection. Do not start the restore again: wait a few minutes, then reload the page. Once the restore has finished, you are signed out. If the page then shows a server error, the backup probably comes from an older version: restart the backend, as explained in "Restoring a backup from an older version" in UPGRADING.md. If nothing has changed after several minutes, check the backend logs before trying again.';
const EXPORT_NO_ANSWER =
  'The connection to the server was cut before the backup was fully downloaded. The export changes nothing on the server: check your connection and try again.';
// Matches either no-answer message wherever it is, for the tests that check it is absent
const NO_ANSWER_CAUSE = /settings\.backup\.(restore|export)NoAnswer/;

type BackupAction = 'export' | 'restore';

/** Starts a backup export, or a confirmed restore of a selected file. */
async function runBackupAction(action: BackupAction) {
  if (action === 'export') {
    await userEvent.click(screen.getByText('Export Backup'));
    return;
  }
  await selectBackupFileAndClickImport();
  await answerRestoreDialog('Restore Backup');
}

const BACKUP_ACTIONS = [
  {
    action: 'export',
    method: 'get',
    path: '/api/backup/export',
    timeoutMessage:
      'Preparing the backup took too long: the proxy in front of the server stopped waiting. Trying again right away will probably fail the same way. Try again later, when the server is less busy. If it keeps failing, check the backend logs and the timeout of any reverse proxy in front of Carta Cocktail.',
  },
  {
    action: 'restore',
    method: 'post',
    path: '/api/backup/import',
    timeoutMessage: RESTORE_TIMEOUT,
  },
] as const;

// The sign-in page that openSignInAfterRestore loads, which explains why the admin was signed out
const SIGN_IN_AFTER_RESTORE = '/login?reason=backup-restored';

// Page loads, which jsdom does not implement: every successful restore ends with one
let assignLocation: Mock<(url: string) => void>;

const exportButton = () => screen.getByRole('button', { name: /Export Backup|Exporting/ });
const restoreButton = () => screen.getByRole('button', { name: /Restore Backup|Restoring/ });

/**
 * Makes the export answer at once with its headers and the start of the archive. The
 * archive ends only when the test calls `finish()`, or is cut when it calls `fail()`:
 * the page has the headers, but not the whole download. A browser then rejects the body
 * read with a TypeError, whose text is its own ("network error" in Chrome).
 */
function holdExportDownload() {
  let archive: ReadableStreamDefaultController<Uint8Array> | undefined;
  let answered: () => void = () => {};
  const headersSent = new Promise<void>((resolve) => {
    answered = resolve;
  });
  // Answered by a stub of fetch: MSW closes a response body that errors mid-stream instead of
  // cutting it, so it cannot simulate a lost connection.
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('/api/backup/export')) return realFetch(input, init);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        archive = controller;
        controller.enqueue(new Uint8Array(8));
      },
    });
    answered();
    return Promise.resolve(
      new Response(body, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="backup.zip"',
        },
      }),
    );
  });
  onTestFinished(() => spy.mockRestore());
  return {
    headersSent,
    finish: () => archive?.close(),
    fail: () => archive?.error(new TypeError('network error')),
  };
}

beforeEach(() => {
  assignLocation = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign: assignLocation });
  localStorage.setItem('token', 'admin-token');
  mockApiResponse('get', '/api/auth/me', admin);
  mockApiResponse(
    'get',
    '/api/settings',
    buildAdminSiteSettings({ siteName: 'My Bar', siteIcon: '🍸' }),
  );
  mockRestore(restoreResult());
  vi.spyOn(toast, 'success').mockReturnValue('toast-1');
  vi.spyOn(toast, 'info').mockReturnValue('toast-2');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.title = '';
});

describe('SettingsPage', () => {
  it('shows a loading state until the site settings arrive', async () => {
    mockApiPending('get', '/api/settings');
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // The providers still load the session and the public settings
    await waitFor(() => expect(document.title).toBe('Carta'));
  });

  it('renders the title, both forms and the backup section after loading', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Site Configuration')).toBeInTheDocument();
    expect(screen.getByText('Admin Profile')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API tokens' })).toBeInTheDocument();
    expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
  });

  it('labels every field and marks the chosen site icon', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    expect(screen.getByLabelText(/Site Name/)).toHaveValue('My Bar');
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('admin@test.local');
    expect(screen.getByLabelText('Current Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('New Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );

    const icons = screen.getByRole('group', { name: 'Site Icon' });
    expect(within(icons).getByRole('button', { name: '🍸' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(icons).getByRole('button', { name: 'No icon' }));
    expect(within(icons).getByRole('button', { name: 'No icon' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(icons).getByRole('button', { name: '🍸' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('saves the site settings, confirms and refreshes the name shown everywhere', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const saved = captureRequest('put', '/api/settings');
    mockApiResponse('get', '/api/public/settings', buildSiteSettings({ siteName: 'New Bar Name' }));

    const siteNameInput = screen.getByDisplayValue('My Bar');
    await user.clear(siteNameInput);
    await user.type(siteNameInput, 'New Bar Name');
    await user.click(siteSaveButton());

    expect(await saved.body).toEqual({ siteName: 'New Bar Name', siteIcon: '🍸' });
    expect(await screen.findByText('Site settings updated')).toBeInTheDocument();
    // SiteSettingsProvider reloaded the public settings
    await waitFor(() => expect(document.title).toBe('New Bar Name'));
  });

  describe('sites allowed to embed the menu', () => {
    const originsField = () => screen.getByLabelText('Allowed sites');
    const codeField = () => screen.getByLabelText('Code to paste in your website');

    it('shows the stored sites, one per line', async () => {
      mockApiResponse(
        'get',
        '/api/settings',
        buildAdminSiteSettings({
          siteName: 'My Bar',
          embedOrigins: ['https://www.mon-bar.fr', 'https://bar.example'],
        }),
      );
      await renderLoadedPage();

      expect(originsField()).toHaveValue('https://www.mon-bar.fr\nhttps://bar.example');
    });

    it('saves the typed sites as a list and shows them as the server stored them', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      mockApiResponse(
        'put',
        '/api/settings',
        buildAdminSiteSettings({ embedOrigins: ['https://www.mon-bar.fr'] }),
      );
      // After the response: the last handler added answers first, and this one passes on
      const saved = captureRequest('put', '/api/settings');

      await user.type(originsField(), ' https://WWW.Mon-Bar.fr/ \n\n');
      await user.click(embedSaveButton());

      expect(await saved.body).toEqual({ embedOrigins: ['https://WWW.Mon-Bar.fr/'] });
      expect(await screen.findByText('Allowed sites updated')).toBeInTheDocument();
      expect(originsField()).toHaveValue('https://www.mon-bar.fr');
    });

    it('shows why the server refused a site', async () => {
      const user = userEvent.setup();
      await renderLoadedPage();
      const refusal = '"http://bar.example" uses http://: only https:// sites can embed the menu';
      mockApiError('put', '/api/settings', 400, refusal);

      await user.type(originsField(), 'http://bar.example');
      await user.click(embedSaveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(refusal);
    });

    it('gives the code of the first public menu, and of the menu chosen in the list', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/menus', [
        buildMenu({ id: 1, name: 'Draft', slug: 'draft', isPublic: false }),
        buildMenu({ id: 2, name: 'Summer', slug: 'summer' }),
        buildMenu({ id: 3, name: 'Winter', slug: 'winter' }),
      ]);
      await renderLoadedPage();

      const origin = window.location.origin;
      expect(await screen.findByLabelText('Menu to embed')).toHaveValue('summer');
      expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument();
      expect(codeField()).toHaveValue(
        // The title is the site name that guests see, from the public settings
        `<iframe src="${origin}/menu/summer" title="Carta" loading="lazy" style="width: 100%; height: 80vh; border: 0"></iframe>`,
      );

      await user.selectOptions(screen.getByLabelText('Menu to embed'), 'winter');
      expect((codeField() as HTMLTextAreaElement).value).toContain(`src="${origin}/menu/winter"`);
    });

    it('copies the code', async () => {
      const user = userEvent.setup();
      mockApiResponse('get', '/api/menus', [buildMenu({ id: 2, slug: 'summer' })]);
      await renderLoadedPage();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

      await user.click(await screen.findByRole('button', { name: 'Copy the code' }));

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/menu/summer'));
      expect(toast.success).toHaveBeenCalledWith('Code copied');
    });

    it('asks for a published menu before giving any code', async () => {
      mockApiResponse('get', '/api/menus', [buildMenu({ id: 1, isPublic: false })]);
      await renderLoadedPage();

      expect(
        await screen.findByText('Publish a menu to get the code to paste in your website.'),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Code to paste in your website')).not.toBeInTheDocument();
    });
  });

  describe('sign out everywhere', () => {
    const SIGN_IN_AFTER_LOGOUT_EVERYWHERE = '/login?reason=logged-out-everywhere';
    const logoutEverywhereButton = () =>
      screen.getByRole('button', { name: 'Sign out everywhere' });

    async function answerLogoutEverywhereDialog(buttonName: 'Sign out everywhere' | 'Cancel') {
      const dialog = await screen.findByRole('alertdialog', { name: 'Sign out everywhere' });
      expect(dialog).toHaveAccessibleDescription(
        'Every device, this one included, will be signed out and will need the password again. Use it when a device was lost or shared.',
      );
      // Decision of 2026-11-27 (F-16): the API tokens go too, and the dialog says so
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Every API token will be deleted too: the scripts and MCP clients that use one will stop working until you create new tokens.',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: buttonName }));
    }

    it('revokes every session, clears this one and opens the sign-in page with its reason', async () => {
      mockApiResponse('post', '/api/auth/logout-all', { message: 'ok' });
      const revoked = captureRequest('post', '/api/auth/logout-all');
      await renderLoadedPage();

      await userEvent.click(logoutEverywhereButton());
      await answerLogoutEverywhereDialog('Sign out everywhere');

      await revoked.body;
      await waitFor(() =>
        expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_LOGOUT_EVERYWHERE),
      );
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('does nothing when the confirmation is cancelled', async () => {
      mockApiResponse('post', '/api/auth/logout-all', { message: 'ok' });
      await renderLoadedPage();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await userEvent.click(logoutEverywhereButton());
      await answerLogoutEverywhereDialog('Cancel');

      const requestedUrls = fetchSpy.mock.calls.map(([input]) =>
        input instanceof Request ? input.url : String(input),
      );
      expect(requestedUrls.some((url) => url.includes('/auth/logout-all'))).toBe(false);
      expect(assignLocation).not.toHaveBeenCalled();
      expect(localStorage.getItem('token')).toBe('admin-token');
    });

    it('keeps the session and shows the error when the revocation fails', async () => {
      mockApiError('post', '/api/auth/logout-all', 500, 'Internal server error');
      await renderLoadedPage();

      await userEvent.click(logoutEverywhereButton());
      await answerLogoutEverywhereDialog('Sign out everywhere');

      expect(await screen.findByText('Internal server error')).toBeInTheDocument();
      expect(assignLocation).not.toHaveBeenCalled();
      expect(localStorage.getItem('token')).toBe('admin-token');
      expect(logoutEverywhereButton()).toBeEnabled();
    });
  });

  it('shows the server message when the site save fails', async () => {
    mockApiError('put', '/api/settings', 400, 'Site name is required');
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(siteSaveButton());

    expect(await screen.findByText('Site name is required')).toBeInTheDocument();
  });

  it('shows a generic error when the site save fails with something else than an Error', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    rejectNextFetch('string error');

    await user.click(siteSaveButton());

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });

  it('refuses two different new passwords without asking the server', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');

    await user.type(screen.getByPlaceholderText('Required to change password'), 'old-password-1');
    await user.type(screen.getByPlaceholderText('Leave blank to keep current'), 'newpass123');
    await user.type(screen.getByPlaceholderText('Retype new password'), 'differentpass');
    await user.click(profileSaveButton());

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(profile.count()).toBe(0);
  });

  it('changes the password and keeps the admin signed in with the new token', async () => {
    mockApiResponse('put', '/api/settings/profile', { ...admin, token: 'new-token' });
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');

    await user.type(screen.getByPlaceholderText('Required to change password'), 'old-password-1');
    await user.type(screen.getByPlaceholderText('Leave blank to keep current'), 'new-password-12');
    await user.type(screen.getByPlaceholderText('Retype new password'), 'new-password-12');
    await user.click(profileSaveButton());

    expect(await profile.body).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-12',
    });
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(screen.getByPlaceholderText('Leave blank to keep current')).toHaveValue('');
  });

  it('sends the current password with a new email and shows the new email', async () => {
    mockApiResponse('put', '/api/settings/profile', { ...admin, email: 'new@test.local' });
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');
    const currentPasswordInput = screen.getByPlaceholderText('Required to change password');
    expect(currentPasswordInput).not.toBeRequired();

    const emailInput = screen.getByDisplayValue('admin@test.local');
    await user.clear(emailInput);
    await user.type(emailInput, 'new@test.local');
    expect(currentPasswordInput).toBeRequired();
    await user.type(currentPasswordInput, 'old-password-1');
    await user.click(profileSaveButton());

    expect(await profile.body).toEqual({
      email: 'new@test.local',
      currentPassword: 'old-password-1',
    });
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
    // The session now holds the new email: it is no longer a change
    expect(screen.getByDisplayValue('new@test.local')).toBeInTheDocument();
    expect(currentPasswordInput).not.toBeRequired();
    expect(localStorage.getItem('token')).toBe('admin-token');
  });

  it('requires the current password with a new password', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('Leave blank to keep current'), 'x');

    expect(screen.getByPlaceholderText('Required to change password')).toBeRequired();
  });

  it('shows the server message when the profile save fails', async () => {
    mockApiError('put', '/api/settings/profile', 400, 'Current password is incorrect');
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(profileSaveButton());

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  });

  it('shows a generic error when the profile save fails with something else than an Error', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    rejectNextFetch('profile string error');

    await user.click(profileSaveButton());

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });

  it('still renders the page when the site settings cannot be loaded', async () => {
    mockApiError('get', '/api/settings', 500, 'Database unavailable');
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('admin@test.local')).toBeInTheDocument();
  });

  // Backup section tests

  it('downloads the backup and shows a success message', async () => {
    const downloads = mockDownload();
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getByText('Export Backup'));

    expect(await screen.findByText('Backup exported successfully')).toBeInTheDocument();
    // Saved under the name sent by the server (Content-Disposition)
    expect(downloads).toEqual(['backup.zip']);
  });

  it('shows the server message when the backup export fails', async () => {
    mockApiError('get', '/api/backup/export', 500, 'Export failed');
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getByText('Export Backup'));

    expect(await screen.findByText('Export failed')).toBeInTheDocument();
  });

  it('shows a generic error when the export fails with something else than an Error', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    rejectNextFetch('export string error');

    await user.click(screen.getByText('Export Backup'));

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });

  it('shows the file name after selecting a backup file', async () => {
    await renderLoadedPage();

    chooseBackupFile();

    expect(await screen.findByText('File: backup.zip')).toBeInTheDocument();
  });

  // Past nginx's limit, Firefox does not read the 413 that nginx sends during the upload
  it('refuses an archive over the backend limit as soon as it is chosen, without sending it', async () => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');

    chooseBackupFile(BACKEND_UPLOAD_LIMIT + 1);

    expect(await screen.findByRole('alert')).toHaveTextContent('The file or request is too large');
    expect(screen.queryByText(/File: .+/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Restore Backup|Restoring/ }),
    ).not.toBeInTheDocument();
    expect(restore.count()).toBe(0);
  });

  it.each([
    ['one byte under the backend limit', BACKEND_UPLOAD_LIMIT - 1],
    ['exactly the backend limit', BACKEND_UPLOAD_LIMIT],
  ])('sends an archive of %s', async (_case, size) => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');
    await selectBackupFileAndClickImport(size);
    await answerRestoreDialog('Restore Backup');

    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_RESTORE));
    expect(restore.count()).toBe(1);
    expect(screen.queryByText('The file or request is too large')).not.toBeInTheDocument();
  });

  it('forgets the refusal when a smaller archive is chosen next', async () => {
    await renderLoadedPage();
    chooseBackupFile(BACKEND_UPLOAD_LIMIT + 1);
    await screen.findByText('The file or request is too large');

    await selectBackupFile(BACKEND_UPLOAD_LIMIT - 1);

    expect(screen.getByText('File: backup.zip')).toBeInTheDocument();
    expect(screen.queryByText('The file or request is too large')).not.toBeInTheDocument();
  });

  it('drops the archive chosen before when a too large one replaces it', async () => {
    await renderLoadedPage();
    await selectBackupFile();

    chooseBackupFile(BACKEND_UPLOAD_LIMIT + 1);

    expect(await screen.findByText('The file or request is too large')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Restore Backup|Restoring/ }),
    ).not.toBeInTheDocument();
  });

  // A proxy in front of the app may have a lower limit than the backend
  it('keeps the translated message of a 413 for an archive sent to the server', async () => {
    mockProxyError('post', '/api/backup/import', 413);
    await renderLoadedPage();
    await selectBackupFileAndClickImport(BACKEND_UPLOAD_LIMIT);
    await answerRestoreDialog('Restore Backup');

    expect(await screen.findByText('The file or request is too large')).toBeInTheDocument();
    expect(screen.queryByText(NO_ANSWER_CAUSE)).not.toBeInTheDocument();
  });

  it('uploads the backup after confirming in the dialog, then opens the sign-in page', async () => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');
    await selectBackupFileAndClickImport();

    expect(restore.count()).toBe(0);
    await answerRestoreDialog('Restore Backup');

    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_RESTORE));
    // The file goes in the "backup" field of a multipart body. Node's fetch drops the
    // name and bytes of a jsdom File, so only the field and its type can be checked.
    const body = await restore.body;
    expect(body).toContain('name="backup"');
    expect(body).toContain('Content-Type: application/zip');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens the sign-in page at once, without a report, when the restore has nothing to report', async () => {
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');

    // The sign-in page says that the backup was restored: nothing else is shown here
    await waitFor(() => expect(assignLocation).toHaveBeenCalledOnce());
    expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_RESTORE);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.backup\.skippedFiles/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /settings\.backup\.signInAfterRestart|auth\.signInAgain/,
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps the restart warning and the skipped files on screen after restoring an older backup', async () => {
    mockRestore(restoreResult({ skippedFiles: 2, restartRecommended: true }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Restart the backend before going on');
    expect(warning).toHaveTextContent(
      'This backup comes from an older version of Carta Cocktail: its database must be updated. Until then, signing in, the admin pages and, in this browser, the public menu may fail with a server error.',
    );
    expect(warning).toHaveTextContent(
      'With Docker, restart the backend container: it updates the database when it starts. Without Docker, run npm run db:deploy in the backend folder, then restart the backend.',
    );
    expect(warning).toHaveTextContent(
      'This may not be enough: for a backup from v1.0.x, or from before v1.8.0 with duplicate category names or unit abbreviations, or, without Docker, from v1.5.0 or older, the database update fails. Read "Restoring a backup from an older version" in UPGRADING.md before restarting.',
    );
    expect(
      screen.getByText(
        '2 files of the uploads folder were not restored: only JPG, PNG and WebP images are restored, once per file name.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Backup restored.')).toBeInTheDocument();
    // Not a plain success while the backend still has to update the database
    expect(toast.info).toHaveBeenCalledWith('Backup restored.');
    expect(toast.success).not.toHaveBeenCalled();
    // Opening the sign-in page by itself would hide the warning before it is read
    expect(assignLocation).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again once the backend has restarted' }),
    );
    expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_RESTORE);
  });

  it('shows the skipped files without the restart warning when the schema is current', async () => {
    mockRestore(restoreResult({ skippedFiles: 1 }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');

    expect(
      await screen.findByText(
        '1 file of the uploads folder was not restored: only JPG, PNG and WebP images are restored, once per file name.',
      ),
    ).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Backup restored.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(assignLocation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(assignLocation).toHaveBeenCalledWith(SIGN_IN_AFTER_RESTORE);
  });

  it('clears the restore report after a successful export', async () => {
    mockDownload();
    mockRestore(restoreResult({ skippedFiles: 1 }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');
    await screen.findByText(
      '1 file of the uploads folder was not restored: only JPG, PNG and WebP images are restored, once per file name.',
    );

    fireEvent.click(screen.getByText('Export Backup'));

    await screen.findByText('Backup exported successfully');
    expect(
      screen.queryByText(
        '1 file of the uploads folder was not restored: only JPG, PNG and WebP images are restored, once per file name.',
      ),
    ).not.toBeInTheDocument();
  });

  it('keeps the restart warning when the export fails', async () => {
    mockRestore(restoreResult({ restartRecommended: true }));
    mockApiError('get', '/api/backup/export', 500, 'Internal server error');
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');
    await screen.findByRole('alert');

    fireEvent.click(screen.getByText('Export Backup'));

    await screen.findByText('Internal server error');
    expect(screen.getByRole('alert')).toHaveTextContent('Restart the backend before going on');
  });

  it('clears the previous restore report when restoring again', async () => {
    mockRestore(restoreResult({ restartRecommended: true }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');
    await screen.findByRole('alert');

    mockApiError('post', '/api/backup/import', 400, 'Import failed');
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');

    await screen.findByText('Import failed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not upload the backup when the dialog is cancelled', async () => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');
    await selectBackupFileAndClickImport();

    await answerRestoreDialog('Cancel');

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(restore.count()).toBe(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the server message when the restore fails', async () => {
    mockApiError('post', '/api/backup/import', 400, 'Import failed');

    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('Restore Backup');

    expect(await screen.findByText('Import failed')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // nginx gives up after 60 s on the export and 300 s on the restore, while the backend keeps working
  it.each(BACKUP_ACTIONS)(
    'explains a proxy timeout (504) on the $action instead of "try again in a moment"',
    async ({ action, method, path, timeoutMessage }) => {
      mockProxyError(method, path, 504);
      await renderLoadedPage();

      await runBackupAction(action);

      expect(await screen.findByText(timeoutMessage)).toBeInTheDocument();
      expect(screen.queryByText(SERVER_UNAVAILABLE)).not.toBeInTheDocument();
      expect(screen.queryByText(NO_ANSWER_CAUSE)).not.toBeInTheDocument();
      expect(screen.queryByText('Backup exported successfully')).not.toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it.each(BACKUP_ACTIONS)(
    'keeps "the server is not responding" for a 502 of nginx on the $action',
    async ({ action, method, path, timeoutMessage }) => {
      mockProxyError(method, path, 502);
      await renderLoadedPage();

      await runBackupAction(action);

      expect(await screen.findByText(SERVER_UNAVAILABLE)).toBeInTheDocument();
      expect(screen.queryByText(timeoutMessage)).not.toBeInTheDocument();
    },
  );

  // The browser (Firefox after 300 s) or a proxy may drop the connection before nginx answers 504
  it('says the restore may still be running when its request gets no HTTP answer', async () => {
    mockNetworkError('post', '/api/backup/import');
    await renderLoadedPage();

    await runBackupAction('restore');

    expect(await screen.findByText(RESTORE_NO_ANSWER)).toBeInTheDocument();
    expect(
      screen.queryByText(
        /The server did not answer in time, but the restore may still be running\./,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/fetch/i)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // The export changes nothing: the message only has to say so, and to try again
  it('says the export can be tried again when its request gets no HTTP answer', async () => {
    const downloads = mockDownload();
    mockNetworkError('get', '/api/backup/export');
    await renderLoadedPage();
    await selectBackupFile();

    await runBackupAction('export');

    expect(await screen.findByText(EXPORT_NO_ANSWER)).toBeInTheDocument();
    expect(screen.queryByText(/fetch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.backup\.restore/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Preparing the backup took too long: the proxy in front of the server stopped waiting. Trying again right away will probably fail the same way. Try again later, when the server is less busy. If it keeps failing, check the backend logs and the timeout of any reverse proxy in front of Carta Cocktail.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Backup exported successfully')).not.toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(exportButton()).toBeEnabled();
    expect(restoreButton()).toBeEnabled();
  });

  // The server did answer: a TypeError while reading its answer is a bug, not a lost connection
  it('does not report a lost connection for an error after the restore was answered', async () => {
    mockApiResponse('post', '/api/backup/import', null);
    await renderLoadedPage();

    await runBackupAction('restore');

    expect(await screen.findByText(/Cannot read properties of null/)).toBeInTheDocument();
    expect(screen.queryByText(NO_ANSWER_CAUSE)).not.toBeInTheDocument();
  });

  // E-49's lock refuses a second restore with a translated JSON error
  it('shows the server message when a restore is refused because another one is running', async () => {
    mockApiError('post', '/api/backup/import', 409, 'A restore is already running');
    await renderLoadedPage();

    await runBackupAction('restore');

    expect(await screen.findByText('A restore is already running')).toBeInTheDocument();
    expect(screen.queryByText(NO_ANSWER_CAUSE)).not.toBeInTheDocument();
  });

  // The server refuses a restore during an export (409), after the whole archive was uploaded
  it('keeps the restore disabled until the export download has been read in full', async () => {
    const downloads = mockDownload();
    const download = holdExportDownload();
    await renderLoadedPage();
    await selectBackupFile();

    await userEvent.click(exportButton());
    await download.headersSent;
    // Lets the page receive the headers and the start of the archive
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(exportButton()).toHaveTextContent('Exporting...');
    expect(restoreButton()).toBeDisabled();
    expect(restoreButton()).toHaveTextContent('Restore Backup');
    expect(downloads).toEqual([]);

    download.finish();

    expect(await screen.findByText('Backup exported successfully')).toBeInTheDocument();
    expect(downloads).toEqual(['backup.zip']);
    expect(restoreButton()).toBeEnabled();
    expect(exportButton()).toBeEnabled();
  });

  it('says the export can be tried again, and enables the restore again, when its download is cut', async () => {
    const downloads = mockDownload();
    const download = holdExportDownload();
    await renderLoadedPage();
    await selectBackupFile();

    await userEvent.click(exportButton());
    await download.headersSent;
    expect(restoreButton()).toBeDisabled();

    download.fail();

    expect(await screen.findByText(EXPORT_NO_ANSWER)).toBeInTheDocument();
    expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    expect(restoreButton()).toBeEnabled();
    expect(exportButton()).toBeEnabled();
    expect(downloads).toEqual([]);
    expect(screen.queryByText('Backup exported successfully')).not.toBeInTheDocument();
  });

  it('enables the restore again when the export is refused', async () => {
    const releaseExport = holdApiResponse(
      'get',
      '/api/backup/export',
      { error: 'A restore is running' },
      409,
    );
    await renderLoadedPage();
    await selectBackupFile();

    await userEvent.click(exportButton());
    expect(restoreButton()).toBeDisabled();

    releaseExport();

    expect(await screen.findByText('A restore is running')).toBeInTheDocument();
    expect(restoreButton()).toBeEnabled();
    expect(exportButton()).toBeEnabled();
  });

  // The server refuses an export during a restore (409)
  it.each([
    {
      outcome: 'success',
      body: restoreResult({ skippedFiles: 1 }),
      status: 200,
      shown:
        '1 file of the uploads folder was not restored: only JPG, PNG and WebP images are restored, once per file name.',
    },
    {
      outcome: 'failure',
      body: { error: 'Invalid backup file' },
      status: 400,
      shown: 'Invalid backup file',
    },
  ])(
    'disables the export while a restore runs, and enables it again after its $outcome',
    async ({ body, status, shown }) => {
      const releaseRestore = holdApiResponse('post', '/api/backup/import', body, status);
      const exports = captureRequest('get', '/api/backup/export');
      await renderLoadedPage();

      await runBackupAction('restore');

      expect(restoreButton()).toHaveTextContent('Restoring...');
      expect(exportButton()).toBeDisabled();
      expect(exportButton()).toHaveTextContent('Export Backup');
      fireEvent.click(exportButton());
      expect(exports.count()).toBe(0);

      releaseRestore();

      expect(await screen.findByText(shown)).toBeInTheDocument();
      expect(exportButton()).toBeEnabled();
    },
  );

  it('shows a generic error when the restore fails with something else than an Error', async () => {
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    rejectNextFetch('import string error');
    await answerRestoreDialog('Restore Backup');

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });
});
