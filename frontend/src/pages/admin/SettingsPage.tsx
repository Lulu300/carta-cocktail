import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { settings as settingsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';

const ICON_OPTIONS = [
  '', '🍸', '🍹', '🥃', '🍷', '🥂', '🍺', '🧉', '🫗',
  '🍾', '🥤', '🧊', '🔥', '🌿', '🍋', '🫒', '🍒',
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refresh: refreshSiteSettings } = useSiteSettings();

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
      if (email !== user?.email) data.email = email;
      if (newPassword) {
        data.currentPassword = currentPassword;
        data.newPassword = newPassword;
      }

      await settingsApi.updateProfile(data);
      setProfileMessage(t('settings.profileUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (siteLoading) {
    return <div className="text-gray-500">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-8">{t('settings.title')}</h1>

      {/* Site Settings */}
      <form onSubmit={handleSiteSave} className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">{t('settings.siteConfig')}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('settings.siteName')}</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('settings.siteIcon')}</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon || '__none__'}
                  type="button"
                  onClick={() => setSiteIcon(icon)}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl transition-colors ${
                    siteIcon === icon
                      ? 'border-amber-400 bg-amber-400/10'
                      : 'border-gray-700 hover:border-gray-500 bg-[#0f0f1a]'
                  }`}
                >
                  {icon || <span className="text-xs text-gray-500">-</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">{t('settings.siteIconHint')}</p>
          </div>
        </div>

        {siteMessage && <p className="mt-4 text-sm text-green-400">{siteMessage}</p>}
        {siteError && <p className="mt-4 text-sm text-red-400">{siteError}</p>}

        <button
          type="submit"
          className="mt-6 bg-amber-400 text-black font-medium px-6 py-2.5 rounded-lg hover:bg-amber-300 transition-colors"
        >
          {t('common.save')}
        </button>
      </form>

      {/* Profile Settings */}
      <form onSubmit={handleProfileSave} className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t('settings.profileConfig')}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('settings.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              required
            />
          </div>

          <hr className="border-gray-800" />

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('settings.currentPassword')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              placeholder={t('settings.currentPasswordPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('settings.newPassword')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              placeholder={t('settings.newPasswordPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('settings.confirmPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              placeholder={t('settings.confirmPasswordPlaceholder')}
            />
          </div>
        </div>

        {profileMessage && <p className="mt-4 text-sm text-green-400">{profileMessage}</p>}
        {profileError && <p className="mt-4 text-sm text-red-400">{profileError}</p>}

        <button
          type="submit"
          className="mt-6 bg-amber-400 text-black font-medium px-6 py-2.5 rounded-lg hover:bg-amber-300 transition-colors"
        >
          {t('common.save')}
        </button>
      </form>
    </div>
  );
}
