import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import SettingsPage from './SettingsPage';

vi.mock('../../services/api', () => ({
  settings: { get: vi.fn(), update: vi.fn(), updateProfile: vi.fn() },
  backup: { exportBackup: vi.fn(), importBackup: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'admin@test.local' } }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdate.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdateProfile.mockResolvedValue({ id: 1, email: 'admin@test.local' } as never);
  mockExportBackup.mockResolvedValue(undefined as never);
  mockImportBackup.mockResolvedValue(undefined as never);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('SettingsPage', () => {
  it('should show loading state initially', () => {
    // Don't resolve the promise yet
    mockGet.mockReturnValue(new Promise(() => {}) as never);
    render(<SettingsPage />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('should render title and both forms after loading', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
      expect(screen.getByText('settings.siteConfig')).toBeInTheDocument();
      expect(screen.getByText('settings.profileConfig')).toBeInTheDocument();
    });
  });

  it('should display site settings after loading', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const siteNameInput = screen.getByDisplayValue('My Bar');
      expect(siteNameInput).toBeInTheDocument();
    });
  });

  it('should display user email in profile form', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });
  });

  it('should save site settings on submit', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('admin@test.local')).toBeInTheDocument();
    });

    // Find the new password and confirm password fields
    const newPasswordInput = screen.getByPlaceholderText('settings.newPasswordPlaceholder');
    const confirmPasswordInput = screen.getByPlaceholderText('settings.confirmPasswordPlaceholder');

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
    render(<SettingsPage />);
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

  it('should show error on profile save failure', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Profile error'));
    const user = userEvent.setup();
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
    // Page should render (not stuck in loading state) after load error
    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
    });
  });

  // Backup section tests

  it('should show backup section title', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.backup.title')).toBeInTheDocument();
    });
  });

  it('should export backup successfully and show success message', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
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
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'backup.zip', { type: 'application/zip' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('settings.backup.fileSelected')).toBeInTheDocument();
    });
  });

  it('should import backup successfully after confirm and show success message', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<SettingsPage />);
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

    await waitFor(() => {
      expect(mockImportBackup).toHaveBeenCalledWith(file);
      expect(screen.getByText('settings.backup.importSuccess')).toBeInTheDocument();
    });
  });

  it('should not import backup when confirm is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'backup.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('settings.backup.import')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('settings.backup.import'));

    // confirm returned false so importBackup should never be called
    expect(mockImportBackup).not.toHaveBeenCalled();
  });

  it('should show error on backup import failure', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockImportBackup.mockRejectedValue(new Error('Import failed'));

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'backup.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('settings.backup.import')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('settings.backup.import'));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeInTheDocument();
    });
  });

  it('should show error on backup import failure with non-Error object', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockImportBackup.mockRejectedValue('import string error');

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('settings.backup.selectFile')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'backup.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('settings.backup.import')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('settings.backup.import'));

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });
});
