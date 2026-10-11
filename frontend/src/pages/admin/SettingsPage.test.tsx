import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import { ConfirmProvider } from '../../contexts/ConfirmContext';
import { toast } from '../../components/ui/ToastStore';

// Keeps the interpolation values visible, so that a test can check the count of skipped files
vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

vi.mock('../../services/api', () => ({
  settings: { get: vi.fn(), update: vi.fn(), updateProfile: vi.fn() },
  backup: { exportBackup: vi.fn(), importBackup: vi.fn() },
}));

// One stable value, as AuthProvider gives: a new user object on each render
// would make the page reset the email field.
const mockAuth = vi.hoisted(() => ({
  user: { id: 1, email: 'admin@test.local' },
  updateSession: vi.fn(),
}));
const mockUpdateSession = mockAuth.updateSession;
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ refresh: vi.fn() }),
}));

import { settings as settingsApi, backup as backupApi } from '../../services/api';
const mockGet = vi.mocked(settingsApi.get);
const mockUpdate = vi.mocked(settingsApi.update);
const mockUpdateProfile = vi.mocked(settingsApi.updateProfile);
const mockExportBackup = vi.mocked(backupApi.exportBackup);
const mockImportBackup = vi.mocked(backupApi.importBackup);

function renderPage() {
  return render(
    <ConfirmProvider>
      <SettingsPage />
    </ConfirmProvider>,
  );
}

async function selectBackupFileAndClickImport(): Promise<File> {
  await waitFor(() => {
    expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
  });

  // Select a file via the hidden input
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
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
  fireEvent.click(within(dialog).getByRole('button', { name: buttonName }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdate.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdateProfile.mockResolvedValue({ id: 1, email: 'admin@test.local' } as never);
  mockExportBackup.mockResolvedValue(undefined as never);
  mockImportBackup.mockResolvedValue({ message: 'Backup restored', skippedFiles: 0, restartRecommended: false });
  vi.spyOn(toast, 'success').mockReturnValue('toast-1');
  vi.spyOn(toast, 'info').mockReturnValue('toast-2');
});

describe('SettingsPage', () => {
  it('should show loading state initially', () => {
    // Don't resolve the promise yet
    mockGet.mockReturnValue(new Promise(() => {}) as never);
    renderPage();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('should render title and both forms after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
      expect(screen.getByText('settings.siteConfig')).toBeInTheDocument();
      expect(screen.getByText('settings.profileConfig')).toBeInTheDocument();
    });
  });

  it('should display site settings after loading', async () => {
    renderPage();
    await waitFor(() => {
      const siteNameInput = screen.getByDisplayValue('My Bar');
      expect(siteNameInput).toBeInTheDocument();
    });
  });

  it('should display user email in profile form', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });
  });

  it('should save site settings on submit', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Bar')).toBeInTheDocument();
    });

    const siteNameInput = screen.getByDisplayValue('My Bar');
    await user.clear(siteNameInput);
    await user.type(siteNameInput, 'New Bar Name');

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[0]); // first save button is for site settings

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ siteName: 'New Bar Name', siteIcon: '🍸' });
    });
  });

  it('should show success message after site save', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Bar')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('settings.siteUpdated')).toBeInTheDocument();
    });
  });

  it('should show error on site save failure', async () => {
    mockUpdate.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Bar')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('should show error on site save failure with non-Error object', async () => {
    mockUpdate.mockRejectedValue('string error');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Bar')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });

  it('should show password mismatch error', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    // Find the new password and confirm password fields
    const newPasswordInput = screen.getByPlaceholderText('settings.newPasswordPlaceholder');
    const confirmPasswordInput = screen.getByPlaceholderText('settings.confirmPasswordPlaceholder');

    await user.type(screen.getByPlaceholderText('settings.currentPasswordPlaceholder'), 'old-password-1');
    await user.type(newPasswordInput, 'newpass123');
    await user.type(confirmPasswordInput, 'differentpass');

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[1]); // second save button is for profile

    await waitFor(() => {
      expect(screen.getByText('settings.passwordMismatch')).toBeInTheDocument();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('should save profile with matching passwords and show success message', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    const currentPasswordInput = screen.getByPlaceholderText('settings.currentPasswordPlaceholder');
    const newPasswordInput = screen.getByPlaceholderText('settings.newPasswordPlaceholder');
    const confirmPasswordInput = screen.getByPlaceholderText('settings.confirmPasswordPlaceholder');

    await user.type(currentPasswordInput, 'oldpass');
    await user.type(newPasswordInput, 'newpass123');
    await user.type(confirmPasswordInput, 'newpass123');

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[1]);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        currentPassword: 'oldpass',
        newPassword: 'newpass123',
      });
      expect(screen.getByText('settings.profileUpdated')).toBeInTheDocument();
    });
  });

  it('should keep the admin logged in with the token returned after a password change', async () => {
    mockUpdateProfile.mockResolvedValue({ id: 1, email: 'admin@test.local', token: 'new-token' });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('settings.currentPasswordPlaceholder'), 'old-password-1');
    await user.type(screen.getByPlaceholderText('settings.newPasswordPlaceholder'), 'new-password-12');
    await user.type(screen.getByPlaceholderText('settings.confirmPasswordPlaceholder'), 'new-password-12');
    await user.click(screen.getAllByText('common.save')[1]);

    await waitFor(() => {
      expect(mockUpdateSession).toHaveBeenCalledWith({ id: 1, email: 'admin@test.local' }, 'new-token');
    });
  });

  it('should send the current password with a new email and update the session', async () => {
    mockUpdateProfile.mockResolvedValue({ id: 1, email: 'new@test.local' });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });
    const currentPasswordInput = screen.getByPlaceholderText('settings.currentPasswordPlaceholder');
    expect(currentPasswordInput).not.toBeRequired();

    const emailInput = screen.getByDisplayValue('admin@test.local');
    await user.clear(emailInput);
    await user.type(emailInput, 'new@test.local');
    expect(currentPasswordInput).toBeRequired();
    await user.type(currentPasswordInput, 'old-password-1');
    await user.click(screen.getAllByText('common.save')[1]);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ email: 'new@test.local', currentPassword: 'old-password-1' });
      expect(mockUpdateSession).toHaveBeenCalledWith({ id: 1, email: 'new@test.local' }, undefined);
    });
  });

  it('should require the current password with a new password', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('settings.newPasswordPlaceholder'), 'x');

    expect(screen.getByPlaceholderText('settings.currentPasswordPlaceholder')).toBeRequired();
  });

  it('should show error on profile save failure', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Profile error'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Profile error')).toBeInTheDocument();
    });
  });

  it('should show error on profile save failure with non-Error object', async () => {
    mockUpdateProfile.mockRejectedValue('profile string error');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText('common.save');
    await user.click(saveButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });

  it('should render after site settings load error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPage();
    // Page should render (not stuck in loading state) after load error
    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });
  });

  // Backup section tests

  it('should show backup section title', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.backup.title')).toBeInTheDocument();
    });
  });

  it('should export backup successfully and show success message', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.backup.export')).toBeInTheDocument();
    });

    const exportButton = screen.getByText('settings.backup.export');
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockExportBackup).toHaveBeenCalledTimes(1);
      expect(screen.getByText('settings.backup.exportSuccess')).toBeInTheDocument();
    });
  });

  it('should show error on backup export failure', async () => {
    mockExportBackup.mockRejectedValue(new Error('Export failed'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.backup.export')).toBeInTheDocument();
    });

    const exportButton = screen.getByText('settings.backup.export');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeInTheDocument();
    });
  });

  it('should show error on backup export failure with non-Error object', async () => {
    mockExportBackup.mockRejectedValue('export string error');
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.backup.export')).toBeInTheDocument();
    });

    const exportButton = screen.getByText('settings.backup.export');
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });

  it('should show file name after selecting a backup file', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'backup.zip', { type: 'application/zip' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('settings.backup.fileSelected(backup.zip)')).toBeInTheDocument();
    });
  });

  it('should import backup after confirming in the dialog and show success message', async () => {
    renderPage();
    const file = await selectBackupFileAndClickImport();

    expect(mockImportBackup).not.toHaveBeenCalled();
    await answerRestoreDialog('settings.backup.import');

    await waitFor(() => {
      expect(mockImportBackup).toHaveBeenCalledWith(file);
      expect(screen.getByText('settings.backup.importSuccess')).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith('settings.backup.importSuccess');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('should reload the page by itself when the restore has nothing to report', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await screen.findByText('settings.backup.importSuccess');
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.backup\.skippedFiles/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settings\.backup\.reload/ })).not.toBeInTheDocument();
  });

  it('should keep the restart warning and the skipped files on screen after restoring an older backup', async () => {
    mockImportBackup.mockResolvedValue({ message: 'Backup restored', skippedFiles: 2, restartRecommended: true });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    renderPage();
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

  it('should show the skipped files without the restart warning when the schema is current', async () => {
    mockImportBackup.mockResolvedValue({ message: 'Backup restored', skippedFiles: 1, restartRecommended: false });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    expect(await screen.findByText('settings.backup.skippedFiles(1)')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('settings.backup.importDone');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.backup.reload' })).toBeInTheDocument();
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it('should clear the restore report after a successful export', async () => {
    mockImportBackup.mockResolvedValue({ message: 'Backup restored', skippedFiles: 1, restartRecommended: false });
    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByText('settings.backup.skippedFiles(1)');

    fireEvent.click(screen.getByText('settings.backup.export'));

    await screen.findByText('settings.backup.exportSuccess');
    expect(screen.queryByText('settings.backup.skippedFiles(1)')).not.toBeInTheDocument();
  });

  it('should keep the restart warning when the export fails', async () => {
    mockImportBackup.mockResolvedValue({ message: 'Backup restored', skippedFiles: 0, restartRecommended: true });
    mockExportBackup.mockRejectedValue(new Error('Internal server error'));
    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByRole('alert');

    fireEvent.click(screen.getByText('settings.backup.export'));

    await screen.findByText('Internal server error');
    expect(screen.getByRole('alert')).toHaveTextContent('settings.backup.restartTitle');
  });

  it('should clear the previous restore report when restoring again', async () => {
    mockImportBackup.mockResolvedValueOnce({ message: 'Backup restored', skippedFiles: 0, restartRecommended: true });
    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');
    await screen.findByRole('alert');

    mockImportBackup.mockRejectedValueOnce(new Error('Import failed'));
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await screen.findByText('Import failed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should not import backup when the dialog is cancelled', async () => {
    renderPage();
    await selectBackupFileAndClickImport();

    await answerRestoreDialog('common.cancel');

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockImportBackup).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('should show error on backup import failure', async () => {
    mockImportBackup.mockRejectedValue(new Error('Import failed'));

    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeInTheDocument();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('should show error on backup import failure with non-Error object', async () => {
    mockImportBackup.mockRejectedValue('import string error');

    renderPage();
    await selectBackupFileAndClickImport();
    await answerRestoreDialog('settings.backup.import');

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });
});
