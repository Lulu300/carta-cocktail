import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { settings as settingsApi } from '../../services/api';
import { useMenus } from '../../queries/menus';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import Button from '../ui/Button';
import CopyButton from '../ui/CopyButton';
import Field from '../ui/Field';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { buildEmbedCode } from '../../utils/embedCode';

/** One origin per line in the form; the API takes and returns a list. */
function parseOriginLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

interface EmbedMenuSettingsProps {
  /** The stored origins, read by the settings page before it renders this form. */
  initialOrigins: string[];
}

/**
 * Sites allowed to show the public menu in an iframe, and the code to paste there. nginx asks
 * the backend for this list on each load of a /menu/ page and puts it in the CSP of that page.
 */
export default function EmbedMenuSettings({ initialOrigins }: EmbedMenuSettingsProps) {
  const { t } = useTranslation();
  const { siteSettings } = useSiteSettings();
  const { data: menus } = useMenus();
  const [originsText, setOriginsText] = useState(initialOrigins.join('\n'));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [chosenSlug, setChosenSlug] = useState('');

  // Guests only reach published menus: the others would show the "not found" page
  const publicMenus = menus?.filter((menu) => menu.isPublic) ?? [];
  const slug = chosenSlug || publicMenus[0]?.slug;
  const embedCode =
    slug &&
    buildEmbedCode(
      `${window.location.origin}/menu/${encodeURIComponent(slug)}`,
      siteSettings.siteName || t('app.name'),
    );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const saved = await settingsApi.update({ embedOrigins: parseOriginLines(originsText) });
      // Shows the origins as stored: lowercased, without a trailing slash, duplicates dropped
      setOriginsText(saved.embedOrigins.join('\n'));
      setMessage(t('settings.embed.saved'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-surface border border-line rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-fg mb-2">{t('settings.embed.title')}</h2>
      <p className="text-sm text-fg-muted mb-4">{t('settings.embed.description')}</p>

      <div className="space-y-4">
        <Field label={t('settings.embed.origins')} hint={t('settings.embed.originsHint')}>
          <Textarea
            rows={3}
            value={originsText}
            onChange={(e) => setOriginsText(e.target.value)}
            placeholder="https://www.mon-bar.fr"
            spellCheck={false}
            autoCapitalize="off"
            className="font-mono text-sm"
          />
        </Field>

        {message && <p className="text-sm text-green-400">{message}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit">{t('common.save')}</Button>

        <hr className="border-line" />

        {embedCode ? (
          <>
            {publicMenus.length > 1 && (
              <Field label={t('settings.embed.menu')}>
                <Select value={slug} onChange={(e) => setChosenSlug(e.target.value)}>
                  {publicMenus.map((menu) => (
                    <option key={menu.id} value={menu.slug}>
                      {menu.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('settings.embed.code')} hint={t('settings.embed.codeHint')}>
              <Textarea
                readOnly
                rows={4}
                value={embedCode}
                onFocus={(e) => e.target.select()}
                className="font-mono text-xs"
              />
            </Field>
            <CopyButton
              text={embedCode}
              copiedMessage={t('settings.embed.copied')}
              failedMessage={t('settings.embed.copyFailed')}
            >
              {t('settings.embed.copy')}
            </CopyButton>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{t('settings.embed.noPublicMenu')}</p>
        )}
      </div>
    </form>
  );
}
