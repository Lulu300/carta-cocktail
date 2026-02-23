import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import SettingsPage from './SettingsPage';

vi.mock('../../services/api', () => ({
  settings: { get: vi.fn(), update: vi.fn(), updateProfile: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'admin@test.local' } }),
}));

vi.mock('../../contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ refresh: vi.fn() }),
}));

import { settings as settingsApi } from '../../services/api';
const mockGet = vi.mocked(settingsApi.get);
const mockUpdate = vi.mocked(settingsApi.update);
const mockUpdateProfile = vi.mocked(settingsApi.updateProfile);

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdate.mockResolvedValue({ id: 1, siteName: 'My Bar', siteIcon: '🍸' } as never);
  mockUpdateProfile.mockResolvedValue({ id: 1, email: 'admin@test.local' } as never);
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
});
