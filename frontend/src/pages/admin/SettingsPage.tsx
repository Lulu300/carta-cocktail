import { useState, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { settings as settingsApi, backup as backupApi } from '../../services/api';
import type { BackupRestoreResult } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { toast } from '../../components/ui/ToastStore';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Icon from '../../components/ui/Icon';
import Input from '../../components/ui/Input';
import { cx } from '../../components/ui/classNames';

const ICON_OPTIONS = [
  '', '🍸', '🍹', '🥃', '🍷', '🥂', '🍺', '🧉', '🫗',
  '🍾', '🥤', '🧊', '🔥', '🌿', '🍋', '🫒', '🍒',
];

/** A restore result the admin must read before the page reloads. */
function needsAdminAttention(result: BackupRestoreResult): boolean {
  return result.restartRecommended || result.skippedFiles > 0;
}

function RestoreReport({ result }: { result: BackupRestoreResult }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-3">
      {result.restartRecommended && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning space-y-2">
          <p className="font-semibold">{t('settings.backup.restartTitle')}</p>
          <p>{t('settings.backup.restartRequired')}</p>
          <p>{t('settings.backup.restartHow')}</p>
          <p>{t('settings.backup.restartMayFail')}</p>
        </div>
      )}
      {result.skippedFiles > 0 && (
        <p className="text-sm text-fg-muted">{t('settings.backup.skippedFiles', { count: result.skippedFiles })}</p>
      )}
      <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
        {result.restartRecommended ? t('settings.backup.reloadAfterRestart') : t('settings.backup.reload')}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, updateSession } = useAuth();
  const { refresh: refreshSiteSettings } = useSiteSettings();
  const confirm = useConfirm();

  // Site settings
  const [siteName, setSiteName] = useState('');
  const [siteIcon, setSiteIcon] = useState('');
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteMessage, setSiteMessage] = useState('');
  const [siteError, setSiteError] = useState('');

  // Profile settings
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  // The server asks for the current password before changing the login email or the password
  const isEmailChanged = email !== user?.email;
  const isCurrentPasswordRequired = isEmailChanged || newPassword !== '';

  // Backup settings
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const siteIconHintId = useId();

  useEffect(() => {
    settingsApi.get().then((data) => {
      setSiteName(data.siteName);
      setSiteIcon(data.siteIcon);
      setSiteLoading(false);
    }).catch(() => setSiteLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) setEmail(user.email);
  }, [user]);

  const handleSiteSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSiteMessage('');
    setSiteError('');
    try {
      await settingsApi.update({ siteName, siteIcon });
      setSiteMessage(t('settings.siteUpdated'));
      await refreshSiteSettings();
    } catch (err: unknown) {
      setSiteError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage('');
    setProfileError('');

    if (newPassword && newPassword !== confirmPassword) {
      setProfileError(t('settings.passwordMismatch'));
      return;
    }

    try {
      const data: { email?: string; currentPassword?: string; newPassword?: string } = {};
      if (isEmailChanged) data.email = email;
      if (newPassword) data.newPassword = newPassword;
      if (isCurrentPasswordRequired) data.currentPassword = currentPassword;

      const { token, ...updatedUser } = await settingsApi.updateProfile(data);
      updateSession(updatedUser, token);
      setProfileMessage(t('settings.profileUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleBackupExport = async () => {
    setBackupMessage('');
    setBackupError('');
    setBackupExporting(true);
    try {
      await backupApi.exportBackup();
      setBackupMessage(t('settings.backup.exportSuccess'));
      // The report of an earlier restore no longer matches the latest message.
      // A failed export keeps it: the restart warning is often why it failed.
      setRestoreResult(null);
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBackupExporting(false);
    }
  };

  const handleBackupImport = async () => {
    if (!backupFile) return;
    const confirmed = await confirm({
      title: t('settings.backup.import'),
      message: t('settings.backup.confirmRestore'),
      confirmLabel: t('settings.backup.import'),
      tone: 'danger',
    });
    if (!confirmed) return;

    setBackupMessage('');
    setBackupError('');
    setRestoreResult(null);
    setBackupImporting(true);
    try {
      const result = await backupApi.importBackup(backupFile);
      setBackupFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (needsAdminAttention(result)) {
        // No automatic reload: it would hide the report before the admin reads it and,
        // after an older backup, log the admin out until the backend restarts.
        setBackupMessage(t('settings.backup.importDone'));
        // Not a plain success while the backend still has to update the database
        if (result.restartRecommended) toast.info(t('settings.backup.importDone'));
        else toast.success(t('settings.backup.importDone'));
        setRestoreResult(result);
      } else {
        setBackupMessage(t('settings.backup.importSuccess'));
        toast.success(t('settings.backup.importSuccess'));
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBackupImporting(false);
    }
  };

  if (siteLoading) {
    return <div role="status" className="text-fg-muted">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold font-serif text-accent mb-8">{t('settings.title')}</h1>

      {/* Site Settings */}
      <form onSubmit={handleSiteSave} className="bg-surface border border-line rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-fg mb-4">{t('settings.siteConfig')}</h2>

        <div className="space-y-4">
          <Field label={t('settings.siteName')} required>
            <Input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </Field>

          <fieldset aria-describedby={siteIconHintId}>
            <legend className="block text-sm text-fg-muted mb-2">{t('settings.siteIcon')}</legend>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon || '__none__'}
                  type="button"
                  onClick={() => setSiteIcon(icon)}
                  aria-pressed={siteIcon === icon}
                  aria-label={icon || t('settings.noIcon')}
                  className={cx(
                    'w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl transition-colors',
                    siteIcon === icon ? 'border-accent bg-accent/10' : 'border-line-strong hover:border-fg-muted bg-canvas',
                  )}
                >
                  {icon || <span aria-hidden="true" className="text-xs text-fg-muted">-</span>}
                </button>
              ))}
            </div>
            <p id={siteIconHintId} className="text-xs text-fg-muted mt-2">{t('settings.siteIconHint')}</p>
          </fieldset>
        </div>

        {siteMessage && <p className="mt-4 text-sm text-green-400">{siteMessage}</p>}
        {siteError && <p className="mt-4 text-sm text-red-400">{siteError}</p>}

        <Button type="submit" className="mt-6">{t('common.save')}</Button>
      </form>

      {/* Profile Settings */}
      <form onSubmit={handleProfileSave} className="bg-surface border border-line rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-fg mb-4">{t('settings.profileConfig')}</h2>

        <div className="space-y-4">
          <Field label={t('settings.email')} required>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <hr className="border-line" />

          <Field label={t('settings.currentPassword')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required={isCurrentPasswordRequired}
              placeholder={t('settings.currentPasswordPlaceholder')}
            />
          </Field>

          <Field label={t('settings.newPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('settings.newPasswordPlaceholder')}
            />
          </Field>

          <Field label={t('settings.confirmPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('settings.confirmPasswordPlaceholder')}
            />
          </Field>
        </div>

        {profileMessage && <p className="mt-4 text-sm text-green-400">{profileMessage}</p>}
        {profileError && <p className="mt-4 text-sm text-red-400">{profileError}</p>}

        <Button type="submit" className="mt-6">{t('common.save')}</Button>
      </form>

      {/* Backup & Restore */}
      <div className="bg-surface border border-line rounded-xl p-6">
        <h2 className="text-lg font-semibold text-fg mb-2">{t('settings.backup.title')}</h2>
        <p className="text-sm text-fg-muted mb-6">{t('settings.backup.description')}</p>

        <div className="space-y-4">
          {/* Export */}
          <div>
            <Button onClick={handleBackupExport} disabled={backupExporting}>
              <Icon name="download" />
              {backupExporting ? t('settings.backup.exporting') : t('settings.backup.export')}
            </Button>
          </div>

          <hr className="border-line" />

          {/* Import */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={backupImporting}
                className="border border-line-strong"
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {t('settings.backup.selectFile')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {backupFile && (
                <span className="text-sm text-fg-muted">
                  {t('settings.backup.fileSelected', { name: backupFile.name })}
                </span>
              )}
            </div>

            {backupFile && (
              <Button variant="danger" onClick={handleBackupImport} disabled={backupImporting}>
                {backupImporting ? t('settings.backup.importing') : t('settings.backup.import')}
              </Button>
            )}
          </div>
        </div>

        {backupMessage && <p className="mt-4 text-sm text-green-400">{backupMessage}</p>}
        {restoreResult && <RestoreReport result={restoreResult} />}
        {backupError && <p className="mt-4 text-sm text-red-400">{backupError}</p>}
      </div>
    </div>
  );
}
