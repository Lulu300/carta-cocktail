import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { ConfirmProvider } from '../../contexts/ConfirmContext';
import { SiteSettingsProvider } from '../../contexts/SiteSettingsContext';
import { toast } from '../../components/ui/ToastStore';
import type { BackupRestoreResult } from '../../services/api';
import { mockDownload } from '../../test/download';
import { buildSiteSettings } from '../../test/factories';
import { ADMIN_USER } from '../../test/msw/handlers';
import {
  captureRequest,
  mockApiError,
  mockApiPending,
  mockApiResponse,
  rejectNextFetch,
} from '../../test/msw/utils';

// Keeps the interpolation values visible, so that a test can check the count of skipped files
vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

const admin = { ...ADMIN_USER, email: 'admin@test.local' };

function restoreResult(overrides: Partial<BackupRestoreResult> = {}): BackupRestoreResult {
  return { message: 'Backup restored', skippedFiles: 0, restartRecommended: false, ...overrides };
}

function mockRestore(result: BackupRestoreResult) {
  mockApiResponse('post', '/api/backup/import', result);
}

/** The page inside the providers of main.tsx: the signed-in admin and the site settings. */
function renderPage() {
  return render(
    <AuthProvider>
      <SiteSettingsProvider>
        <ConfirmProvider>
          <SettingsPage />
        </ConfirmProvider>
      </SiteSettingsProvider>
    </AuthProvider>,
  );
}

/** Renders the page and waits for the site settings and the admin email. */
async function renderLoadedPage() {
  renderPage();
  expect(await screen.findByDisplayValue('My Bar')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('admin@test.local')).toBeInTheDocument();
}

function siteSaveButton() {
  return screen.getAllByText('common.save')[0];
}

function profileSaveButton() {
  return screen.getAllByText('common.save')[1];
}

async function selectBackupFileAndClickImport(): Promise<File> {
  await waitFor(() => {
    expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
  });

  // Select a file via the hidden input
  const fileInput = document.querySelector('input[type="file"]');
  if (!(fileInput instanceof HTMLInputElement)) throw new Error('No file input');
  const file = new File(['content'], 'backup.zip', { type: 'application/zip' });
  fireEvent.change(fileInput, { target: { files: [file] } });

  // Import button appears after file selection
  await waitFor(() => {
    expect(screen.getByText('settings.backup.import')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('settings.backup.import'));
  return file;
}

async function answerRestoreDialog(buttonName: 'settings.backup.import' | 'common.cancel') {
  const dialog = await screen.findByRole('alertdialog', { name: 'settings.backup.import' });
  expect(dialog).toHaveAccessibleDescription('settings.backup.confirmRestore');
  // userEvent waits for the restore that the answer starts: its updates stay inside act()
  await userEvent.click(within(dialog).getByRole('button', { name: buttonName }));
}

beforeEach(() => {
  localStorage.setItem('token', 'admin-token');
  mockApiResponse('get', '/api/auth/me', admin);
  mockApiResponse('get', '/api/settings', buildSiteSettings({ siteName: 'My Bar', siteIcon: '🍸' }));
  mockRestore(restoreResult());
  vi.spyOn(toast, 'success').mockReturnValue('toast-1');
  vi.spyOn(toast, 'info').mockReturnValue('toast-2');
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = '';
});

describe('SettingsPage', () => {
  it('shows a loading state until the site settings arrive', async () => {
    mockApiPending('get', '/api/settings');
    renderPage();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
    // The providers still load the session and the public settings
    await waitFor(() => expect(document.title).toBe('Carta'));
  });

  it('renders the title, both forms and the backup section after loading', async () => {
    await renderLoadedPage();
    expect(screen.getByRole('heading', { level: 1, name: 'settings.title' })).toBeInTheDocument();
    expect(screen.getByText('settings.siteConfig')).toBeInTheDocument();
    expect(screen.getByText('settings.profileConfig')).toBeInTheDocument();
    expect(screen.getByText('settings.backup.title')).toBeInTheDocument();
  });

  it('labels every field and marks the chosen site icon', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    expect(screen.getByLabelText(/settings\.siteName/)).toHaveValue('My Bar');
    expect(screen.getByLabelText(/settings\.email/)).toHaveValue('admin@test.local');
    expect(screen.getByLabelText('settings.currentPassword')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('settings.newPassword')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('settings.confirmPassword')).toHaveAttribute('autocomplete', 'new-password');

    const icons = screen.getByRole('group', { name: 'settings.siteIcon' });
    expect(within(icons).getByRole('button', { name: '🍸' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(icons).getByRole('button', { name: 'settings.noIcon' }));
    expect(within(icons).getByRole('button', { name: 'settings.noIcon' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(icons).getByRole('button', { name: '🍸' })).toHaveAttribute('aria-pressed', 'false');
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
    expect(await screen.findByText('settings.siteUpdated')).toBeInTheDocument();
    // SiteSettingsProvider reloaded the public settings
    await waitFor(() => expect(document.title).toBe('New Bar Name'));
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

    expect(await screen.findByText('common.error')).toBeInTheDocument();
  });

  it('refuses two different new passwords without asking the server', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');

    await user.type(screen.getByPlaceholderText('settings.currentPasswordPlaceholder'), 'old-password-1');
    await user.type(screen.getByPlaceholderText('settings.newPasswordPlaceholder'), 'newpass123');
    await user.type(screen.getByPlaceholderText('settings.confirmPasswordPlaceholder'), 'differentpass');
    await user.click(profileSaveButton());

    expect(await screen.findByText('settings.passwordMismatch')).toBeInTheDocument();
    expect(profile.count()).toBe(0);
  });

  it('changes the password and keeps the admin signed in with the new token', async () => {
    mockApiResponse('put', '/api/settings/profile', { ...admin, token: 'new-token' });
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');

    await user.type(screen.getByPlaceholderText('settings.currentPasswordPlaceholder'), 'old-password-1');
    await user.type(screen.getByPlaceholderText('settings.newPasswordPlaceholder'), 'new-password-12');
    await user.type(screen.getByPlaceholderText('settings.confirmPasswordPlaceholder'), 'new-password-12');
    await user.click(profileSaveButton());

    expect(await profile.body).toEqual({ currentPassword: 'old-password-1', newPassword: 'new-password-12' });
    expect(await screen.findByText('settings.profileUpdated')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(screen.getByPlaceholderText('settings.newPasswordPlaceholder')).toHaveValue('');
  });

  it('sends the current password with a new email and shows the new email', async () => {
    mockApiResponse('put', '/api/settings/profile', { ...admin, email: 'new@test.local' });
    const user = userEvent.setup();
    await renderLoadedPage();
    const profile = captureRequest('put', '/api/settings/profile');
    const currentPasswordInput = screen.getByPlaceholderText('settings.currentPasswordPlaceholder');
    expect(currentPasswordInput).not.toBeRequired();

    const emailInput = screen.getByDisplayValue('admin@test.local');
    await user.clear(emailInput);
    await user.type(emailInput, 'new@test.local');
    expect(currentPasswordInput).toBeRequired();
    await user.type(currentPasswordInput, 'old-password-1');
    await user.click(profileSaveButton());

    expect(await profile.body).toEqual({ email: 'new@test.local', currentPassword: 'old-password-1' });
    expect(await screen.findByText('settings.profileUpdated')).toBeInTheDocument();
    // The session now holds the new email: it is no longer a change
    expect(screen.getByDisplayValue('new@test.local')).toBeInTheDocument();
    expect(currentPasswordInput).not.toBeRequired();
    expect(localStorage.getItem('token')).toBe('admin-token');
  });

  it('requires the current password with a new password', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.type(screen.getByPlaceholderText('settings.newPasswordPlaceholder'), 'x');

    expect(screen.getByPlaceholderText('settings.currentPasswordPlaceholder')).toBeRequired();
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

    expect(await screen.findByText('common.error')).toBeInTheDocument();
  });

  it('still renders the page when the site settings cannot be loaded', async () => {
    mockApiError('get', '/api/settings', 500, 'Database unavailable');
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'settings.title' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('admin@test.local')).toBeInTheDocument();
  });

  // Backup section tests

  it('downloads the backup and shows a success message', async () => {
    const downloads = mockDownload();
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getByText('settings.backup.export'));

    expect(await screen.findByText('settings.backup.exportSuccess')).toBeInTheDocument();
    // Saved under the name sent by the server (Content-Disposition)
    expect(downloads).toEqual(['backup.zip']);
  });

  it('shows the server message when the backup export fails', async () => {
    mockApiError('get', '/api/backup/export', 500, 'Export failed');
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(screen.getByText('settings.backup.export'));

    expect(await screen.findByText('Export failed')).toBeInTheDocument();
  });

  it('shows a generic error when the export fails with something else than an Error', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();
    rejectNextFetch('export string error');

    await user.click(screen.getByText('settings.backup.export'));

    expect(await screen.findByText('common.error')).toBeInTheDocument();
  });

  it('shows the file name after selecting a backup file', async () => {
    await renderLoadedPage();

    const fileInput = document.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) throw new Error('No file input');
    fireEvent.change(fileInput, { target: { files: [new File(['content'], 'backup.zip', { type: 'application/zip' })] } });

    expect(await screen.findByText('settings.backup.fileSelected(backup.zip)')).toBeInTheDocument();
  });

  it('uploads the backup after confirming in the dialog and shows a success message', async () => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');
    await selectBackupFileAndClickImport();

    expect(restore.count()).toBe(0);
    await answerRestoreDialog('settings.backup.import');

    expect(await screen.findByText('settings.backup.importSuccess')).toBeInTheDocument();
    // The file goes in the "backup" field of a multipart body. Node's fetch drops the
    // name and bytes of a jsdom File, so only the field and its type can be checked.
    const body = await restore.body;
    expect(body).toContain('name="backup"');
    expect(body).toContain('Content-Type: application/zip');
    expect(toast.success).toHaveBeenCalledWith('settings.backup.importSuccess');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('reloads the page by itself when the restore has nothing to report', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await screen.findByText('settings.backup.importSuccess');
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.backup\.skippedFiles/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settings\.backup\.reload/ })).not.toBeInTheDocument();
  });

  it('keeps the restart warning and the skipped files on screen after restoring an older backup', async () => {
    mockRestore(restoreResult({ skippedFiles: 2, restartRecommended: true }));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('settings.backup.restartTitle');
    expect(warning).toHaveTextContent('settings.backup.restartRequired');
    expect(warning).toHaveTextContent('settings.backup.restartHow');
    expect(warning).toHaveTextContent('settings.backup.restartMayFail');
    expect(screen.getByText('settings.backup.skippedFiles(2)')).toBeInTheDocument();
    expect(screen.getByText('settings.backup.importDone')).toBeInTheDocument();
    // Not a plain success while the backend still has to update the database
    expect(toast.info).toHaveBeenCalledWith('settings.backup.importDone');
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'settings.backup.reloadAfterRestart' })).toBeInTheDocument();
    // Reloading would log the admin out before the warning is read
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it('shows the skipped files without the restart warning when the schema is current', async () => {
    mockRestore(restoreResult({ skippedFiles: 1 }));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    expect(await screen.findByText('settings.backup.skippedFiles(1)')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('settings.backup.importDone');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.backup.reload' })).toBeInTheDocument();
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it('clears the restore report after a successful export', async () => {
    mockDownload();
    mockRestore(restoreResult({ skippedFiles: 1 }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByText('settings.backup.skippedFiles(1)');

    fireEvent.click(screen.getByText('settings.backup.export'));

    await screen.findByText('settings.backup.exportSuccess');
    expect(screen.queryByText('settings.backup.skippedFiles(1)')).not.toBeInTheDocument();
  });

  it('keeps the restart warning when the export fails', async () => {
    mockRestore(restoreResult({ restartRecommended: true }));
    mockApiError('get', '/api/backup/export', 500, 'Internal server error');
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByRole('alert');

    fireEvent.click(screen.getByText('settings.backup.export'));

    await screen.findByText('Internal server error');
    expect(screen.getByRole('alert')).toHaveTextContent('settings.backup.restartTitle');
  });

  it('clears the previous restore report when restoring again', async () => {
    mockRestore(restoreResult({ restartRecommended: true }));
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByRole('alert');

    mockApiError('post', '/api/backup/import', 400, 'Import failed');
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await screen.findByText('Import failed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not upload the backup when the dialog is cancelled', async () => {
    await renderLoadedPage();
    const restore = captureRequest('post', '/api/backup/import');
    await selectBackupFileAndClickImport();

    await answerRestoreDialog('common.cancel');

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
    await answerRestoreDialog('settings.backup.import');

    expect(await screen.findByText('Import failed')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows a generic error when the restore fails with something else than an Error', async () => {
    await renderLoadedPage();
    await selectBackupFileAndClickImport();
    rejectNextFetch('import string error');
    await answerRestoreDialog('settings.backup.import');

    expect(await screen.findByText('common.error')).toBeInTheDocument();
  });
});
