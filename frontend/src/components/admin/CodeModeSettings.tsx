import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { settings as settingsApi } from '../../services/api';
import { useConfirm } from '../../contexts/ConfirmContext';
import Alert from '../ui/Alert';
import ToggleSwitch from '../ui/ToggleSwitch';

interface CodeModeSettingsProps {
  /** The stored setting, read by the settings page before it renders this section. */
  initialEnabled: boolean;
}

/**
 * Code Mode of the MCP server: the `search` and `execute` tools, which run code written by an AI
 * agent on the server. Off by default; turning it on asks for a confirmation.
 */
export default function CodeModeSettings({ initialEnabled }: CodeModeSettingsProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChange = async (next: boolean) => {
    if (next) {
      const confirmed = await confirm({
        title: t('settings.codeMode.confirmTitle'),
        message: t('settings.codeMode.confirmEnable'),
        confirmLabel: t('settings.codeMode.enable'),
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setMessage('');
    setError('');
    setSaving(true);
    try {
      const saved = await settingsApi.updateCodeMode({ enabled: next });
      setEnabled(saved.codeModeEnabled);
      setMessage(
        t(saved.codeModeEnabled ? 'settings.codeMode.enabled' : 'settings.codeMode.disabled'),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-fg mb-2">{t('settings.codeMode.title')}</h2>
      <p className="text-sm text-fg-muted mb-4">{t('settings.codeMode.description')}</p>

      <Alert tone="warning" title={t('settings.codeMode.warningTitle')}>
        <p>{t('settings.codeMode.warning')}</p>
      </Alert>

      <ToggleSwitch
        checked={enabled}
        onChange={(next) => void handleChange(next)}
        label={t('settings.codeMode.toggle')}
        disabled={saving}
        className="mt-4"
      />

      {message && <p className="mt-4 text-sm text-green-400">{message}</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
